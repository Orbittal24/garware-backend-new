


const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const { format } = require('date-fns');
const app = express();
const port = 9001; // Choose any available port

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));    


// Middleware to parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));



// Middleware to parse application/json
app.use(bodyParser.json());
app.use(express.json());



// Database configuration
const dbConfig = {
  user: 'admin',
  password: 'admin',
  server: 'OM-5CD64809P8',
  database: 'Garware',
  options: {
    encrypt: true, // Use this if you're on Windows Azure
    trustServerCertificate: true, // Accept self-signed certificate
    requestTimeout: 30000 // Increase request timeout to 30 seconds
  },
  pool: {
    max: 50, // Increase pool size
    min: 0,
    idleTimeoutMillis: 30000 // Increase idle timeout
  }
};

   var dbconn = new sql.ConnectionPool(dbConfig)




// Main array for Actual Run Time
const previousPulseCounts = {}; // { machineId: { pulseCount: number, startTime: Date } }



let machineData = [];








// run hrs all line by shift wise  || target || latest construction || actual live count mtr wise (length counters)
app.post('/api/run_hrs_all_line_shift', async (req, res) => {
  const dates = req.body; // Expecting an array of dates

  console.log('Received request body:', req.body);

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ message: 'Request body should be a non-empty array' });
  }

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Capture the current local time
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentSeconds = String(now.getSeconds()).padStart(2, '0');
    const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
    const currentDateString = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

    const results = [];

    for (const date of dates) {
      const dateString = new Date(date);
      const dateISO = dateString.toISOString().split('T')[0]; // Convert date to YYYY-MM-DD format

      const result = await pool.request()
        .query(`SELECT * FROM [Garware].[dbo].[shift_master]`);
      const shifts = result.recordset;

      let currentShift = null;

      shifts.forEach(shift => {
        const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
        const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format

        if (endTime < startTime) { // Shift spans midnight
          if (currentTimeString >= startTime || currentTimeString <= endTime) {
            currentShift = shift;
          }
        } else { // Regular shift
          if (currentTimeString >= startTime && currentTimeString <= endTime) {
            currentShift = shift;
          }
        }
      });

      if (currentShift) {
        // Determine the correct start and end datetimes for the current shift
        let shiftStartDate = new Date(dateString);
        let shiftEndDate = new Date(dateString);

        const [startHours, startMinutes, startSeconds] = currentShift.starttime.split(':').map(Number);
        const [endHours, endMinutes, endSeconds] = currentShift.endtime.split(':').map(Number);

        shiftStartDate.setHours(startHours, startMinutes, startSeconds);
        shiftEndDate.setHours(endHours, endMinutes, endSeconds);

        if (endHours < startHours) {
          // Shift spans midnight
          if (now.getHours() < startHours) {
            shiftStartDate.setDate(shiftStartDate.getDate() - 1);
          } else {
            shiftEndDate.setDate(shiftEndDate.getDate() + 1);
          }
        }

        const formatDate = (date) => {
          const [day, month, year] = [date.getDate(), date.getMonth() + 1, date.getFullYear()];
          const [hours, minutes, seconds] = [date.getHours(), date.getMinutes(), date.getSeconds()];
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000Z`;
        };

        const shiftStartDateISO = formatDate(shiftStartDate);
        const shiftEndDateISO = formatDate(shiftEndDate);

        const liveCountData = await pool.request()
          .input('date1', sql.DateTime, shiftStartDateISO)
          .input('date2', sql.DateTime, shiftEndDateISO)
          .query(`
            SELECT line_no, SUM(run_time) AS totalrun_time
            FROM [Garware].[dbo].[atual_master_live]
            WHERE shift_start >= @date1 
              AND shift_end <= @date2
            GROUP BY line_no
          `);

        const totalrun_time = liveCountData.recordset.map(record => {
          const runTimeInSeconds = record.totalrun_time;

          // Convert seconds to minutes
          const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
            ? Math.floor(runTimeInSeconds / 60)
            : 0;

          // Convert minutes to hours
          const runTimeInHours = runTimeInMinutes / 60;
          
          return {
            ...record,
            run_time_minutes: runTimeInMinutes,
            run_time_hours: runTimeInHours.toFixed(2)
          };
        });

        results.push({ 
          date: dateString, 
          shiftStartDate: shiftStartDateISO, 
          shiftEndDate: shiftEndDateISO, 
          totalrun_time 
        });
      } else {
        results.push({ 
          date: dateString, 
          error: 'No current shift found for the given date and time' 
        });
      }
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No valid data found' });
    }

    res.status(200).json({ 
      message: 'RUN HRS. | all plant (Line Wise) (Shift Wise)',
      results 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    //await sql.close();
  }
});


// run hrs one by one line by shift - machine wise
app.post('/api/run_hrs_One_line_shift', async (req, res) => {
  const { dataArray } = req.body; // Expecting an array of objects with 'date' and 'Line'

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    const results = [];

    // Iterate through each item in the dataArray
    for (const { date, Line } of dataArray) {
      console.log(`Processing Line: ${Line} for Date: ${date}`);

      // Capture the current local time
      const now = new Date();
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentSeconds = String(now.getSeconds()).padStart(2, '0');
      const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
      console.log("Current Time:", currentTimeString);

      const result = await pool.request().query(`SELECT * FROM [Garware].[dbo].[shift_master]`);
      const shifts = result.recordset;

      let currentShift = null;

      shifts.forEach(shift => {
        const startTime = shift.starttime;
        const endTime = shift.endtime;

        if (endTime < startTime) { // Shift spans midnight
          if (currentTimeString >= startTime || currentTimeString <= endTime) {
            currentShift = shift;
          }
        } else { // Regular shift
          if (currentTimeString >= startTime && currentTimeString <= endTime) {
            currentShift = shift;
          }
        }
      });

      if (currentShift) {
        // Use the provided date from the request body
        let shiftStartDate = new Date(date);
        let shiftEndDate = new Date(date);

        const [startHours, startMinutes, startSeconds] = currentShift.starttime.split(':').map(Number);
        const [endHours, endMinutes, endSeconds] = currentShift.endtime.split(':').map(Number);

        shiftStartDate.setHours(startHours, startMinutes, startSeconds);
        shiftEndDate.setHours(endHours, endMinutes, endSeconds);

        if (endHours < startHours) { // If the shift spans midnight
          if (now.getHours() < startHours) {
            shiftStartDate.setDate(shiftStartDate.getDate() - 1);
          } else {
            shiftEndDate.setDate(shiftEndDate.getDate() + 1);
          }
        }

        const formatDate = (date) => {
          const [day, month, year] = [date.getDate(), date.getMonth() + 1, date.getFullYear()];
          const [hours, minutes, seconds] = [date.getHours(), date.getMinutes(), date.getSeconds()];
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000Z`;
        };

        const shiftStartDateISO = formatDate(shiftStartDate);
        const shiftEndDateISO = formatDate(shiftEndDate);

        console.log('Shift Start Date Formatted:', shiftStartDateISO);
        console.log('Shift End Date Formatted:', shiftEndDateISO);

        let liveCountData = await pool.request()
          .input('date1', sql.DateTime, shiftStartDateISO)
          .input('date2', sql.DateTime, shiftEndDateISO)
          .input('Line', sql.Int, Line)
          .query(`
            WITH LatestEntries AS (
              SELECT 
                actual_machine_no,
                final_live_count,
                construction,
                target,
                actual_date,
                ROW_NUMBER() OVER (
                  PARTITION BY actual_machine_no 
                  ORDER BY actual_date DESC
                ) AS rn
              FROM 
                [Garware].[dbo].[atual_master_live]
              WHERE 
                line_no = @Line AND 
                shift_start >= @date1 
                AND shift_end <= @date2
            ),
            TotalCounts AS (
              SELECT
                actual_machine_no,
                SUM(final_live_count) AS totalLiveCount,
                SUM(run_time) AS totalrun_time
              FROM
                [Garware].[dbo].[atual_master_live]
              WHERE
                line_no = @Line AND 
                shift_start >= @date1 
                AND shift_end <= @date2
              GROUP BY
                actual_machine_no
            )
            SELECT
              tc.actual_machine_no,
              tc.totalrun_time,
              tc.totalLiveCount,
              le.construction AS latest_construction,
              le.target
            FROM
              TotalCounts tc
            JOIN
              LatestEntries le
            ON tc.actual_machine_no = le.actual_machine_no
            WHERE le.rn = 1;
          `);

        if (liveCountData.recordset.length > 0) {
          const totalrun_time = liveCountData.recordset.map(record => {
            const runTimeInSeconds = record.totalrun_time;
            const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
              ? Math.floor(runTimeInSeconds / 60)
              : 0;
            const runTimeInHours = runTimeInMinutes / 60;

            return {
              ...record,
              run_time_minutes: runTimeInMinutes,
              run_time_hours: runTimeInHours.toFixed(2)
            };
          });

        

          results.push({
            line: Line,
            date,
            totalrun_time,
           
          });
        } else {
          results.push({
            line: Line,
            date,
            message: 'No live count data found for the given date range and line.'
          });
        }
      }
    }

    res.status(200).json({
      message: 'RUN HRS. | Line-Machine (Line Machine Wise Shift Wise)',
      data: results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


// run hrs all line by  whole day wise
app.post('/api/run_hrs_all_plant_wholeDay', async (req, res) => {
  const { actualDates } = req.body; // Expecting an array of actualDate

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Array to store results for each date
    let results = [];

    // Iterate over the array of dates
    for (const actualDate of actualDates) {
      console.log(`Processing date: ${actualDate}`);

      // Fetch the live count data based on the provided date
      const liveCountData = await pool.request()
        .input('actualDate', sql.DateTime, actualDate)
        .query(`
          SELECT line_no, SUM(run_time) AS totalrun_time
          FROM [Garware].[dbo].[atual_master_live]
          WHERE CONVERT(Date, shift_start) = @actualDate 
          GROUP BY line_no
        `);

      // Convert total run time from seconds to minutes and hours
      const totalrun_time = liveCountData.recordset.map(record => {
        const runTimeInSeconds = record.totalrun_time;

        // Convert seconds to minutes
        const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
          ? Math.floor(runTimeInSeconds / 60)
          : 0;

        // Convert minutes to hours and format to 2 decimal places
        const runTimeInHours = (runTimeInMinutes / 60).toFixed(2);

        return {
          ...record,
          run_time_minutes: runTimeInMinutes,
          run_time_hours: runTimeInHours
        };
      });

      // If data is found, store the results
      if (totalrun_time.length > 0) {
        results.push({
          actualDate,
          totalrun_time
        });
      } else {
        results.push({
          actualDate,
          message: 'No live count data found for this date.'
        });
      }
    }

    console.log("Final Results:", results);

    // Send the response with the calculated run hours for all dates
    res.status(200).json({
      message: 'RUN HRS. | All plants (line-wise) for the entire day across multiple dates',
      results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    sql.close();
  }
});

// run hrs all line by whole day wise  || target || latest construction || actual live count mtr wise (length counters)
app.post('/api/run_hrs_Line_machine_wholeDay', async (req, res) => {
  const { dataArray } = req.body; // Expecting an array of objects with 'date' and 'Line'

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    const results = [];

    // Iterate through each item in the dataArray
    for (const { actualDate, Line } of dataArray) {
      console.log(`Processing Line: ${Line} for Date: ${actualDate}`);

    


        let liveCountData = await pool.request()
        .input('actualDate', sql.DateTime, actualDate)
         .input('Line', sql.Int, Line)
          .query(`
            WITH LatestEntries AS (
              SELECT 
                actual_machine_no,
                final_live_count,
                construction,
                target,
                actual_date,
                ROW_NUMBER() OVER (
                  PARTITION BY actual_machine_no 
                  ORDER BY actual_date DESC
                ) AS rn
              FROM 
                [Garware].[dbo].[atual_master_live]
              WHERE 
                line_no = @Line AND 
                 CONVERT(Date, shift_start) = @actualDate
            ),
            TotalCounts AS (
              SELECT
                actual_machine_no,
                SUM(final_live_count) AS totalLiveCount,
                SUM(run_time) AS totalrun_time
              FROM
                [Garware].[dbo].[atual_master_live]
              WHERE
                line_no = @Line AND 
                CONVERT(Date, shift_start) = @actualDate
              GROUP BY
                actual_machine_no
            )
            SELECT
              tc.actual_machine_no,
              tc.totalrun_time,
              tc.totalLiveCount,
              le.construction AS latest_construction,
              le.target
            FROM
              TotalCounts tc
            JOIN
              LatestEntries le
            ON tc.actual_machine_no = le.actual_machine_no
            WHERE le.rn = 1;
          `);

        if (liveCountData.recordset.length > 0) {
          const totalrun_time = liveCountData.recordset.map(record => {
            const runTimeInSeconds = record.totalrun_time;
            const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
              ? Math.floor(runTimeInSeconds / 60)
              : 0;
            const runTimeInHours = runTimeInMinutes / 60;

            return {
              ...record,
              run_time_minutes: runTimeInMinutes,
              run_time_hours: runTimeInHours.toFixed(2)
            };
          });

        

          results.push({
            line: Line,
            actualDate,
            totalrun_time,
           
          });
        } else {
          results.push({
            line: Line,
            actualDate,
            message: 'No live count data found for the given date range and line.'
          });
        }
      }
    

    res.status(200).json({
      message: 'RUN HRS. | Line machine (line-machine wise) for the entire day',
      data: results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});








// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

