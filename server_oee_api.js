


const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const { format } = require('date-fns');
const app = express();
const port = 9003; // Choose any available port

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




// Oee line machine wise
app.post('/api/calculateOEELine_machine',  async (req, res) => {
    const dataArray = req.body;  // Expecting an array of objects with date1, date2, Line, and machine
    
    console.log('Received request body:', dataArray);
    
    try {
      // Connect to the database
      const pool = await sql.connect(dbConfig);
  
      // Convert 24 hours into minutes and store it in variable1
      const variable1 = 24 * 60;
  
      // Select tea_time and lunch_time from shift_master table and subtract it from variable1
      const shiftData = await pool.request()
        .query(`
          SELECT SUM(tea_time) AS tea_time, SUM(lunch_time) AS lunch_time
          FROM [Garware].[dbo].[shift_master]
        `);
  
      console.log("variable1:", variable1);
      if (shiftData.recordset.length === 0) {
        res.status(404).json({ message: 'No shift data found.' });
        return;
      }
  
      const { tea_time, lunch_time } = shiftData.recordset[0];
      console.log("tea_time + lunch_time:", tea_time, lunch_time);
      const variable2 = variable1 - (tea_time + lunch_time);
      console.log("variable2:", variable2);
  
      // Array to store results for each set of inputs
      const results = [];
  
      // Loop through each set of data in the array
      for (const data of dataArray) {
        const { date1, date2, Line, machine } = data;
  
        // Calculate Availability
        const availability = variable2 / variable1;
  
        // Calculate Performance
        const targetData = await pool.request()
          .input('Line', sql.Int, Line)
          .input('machine', sql.Int, machine)
          .query(`
            SELECT SUM(Target_in_mtr) AS totalTarget
            FROM [Garware].[dbo].[master_set_machine_target]
            WHERE line_no = @Line AND machine_no = @machine
          `);
  
        if (targetData.recordset.length === 0) {
          results.push({ 
            message: `No target data found for line ${Line} and machine ${machine}.`,
            date1,
            date2,
            Line,
            machine
          });
          continue;  // Skip to the next iteration
        }
  
        const variable3 = targetData.recordset[0].totalTarget;
        console.log("variable3:", variable3);
  
        // Select live count data based on the shift start and end times
        const liveCountData = await pool.request()
          .input('Line', sql.Int, Line)
          .input('date1', sql.DateTime, date1)
          .input('date2', sql.DateTime, date2)
          .input('machine', sql.Int, machine)
          .query(`
            SELECT SUM(final_live_count) AS totalLiveCount
            FROM [Garware].[dbo].[atual_master_live]
            WHERE CONVERT(date, shift_start) >= @date1 
            AND CONVERT(date, shift_end) <= @date2
            AND line_no = @Line 
            AND actual_machine_no = @machine
          `);
  
        if (liveCountData.recordset.length === 0) {
          results.push({ 
            message: `No live count data found for the given date range and line ${Line} and machine ${machine}.`,
            date1,
            date2,
            Line,
            machine
          });
          continue;  // Skip to the next iteration
        }
  
        const variable4 = liveCountData.recordset[0].totalLiveCount;
        console.log("variable4:", variable4);
        const performance = variable4 / variable3;
  
        // Calculate Quality
        const variable5 = 0.9 * variable4;
        console.log("variable5:", variable5);
        const quality = variable5 / variable4;
  
        // Calculate OEE as a percentage
        const oee = (availability * performance * quality) * 100;
  
        console.log('Availability:', availability);
        console.log('Performance:', performance);
        console.log('Quality:', quality);
        console.log('OEE:', oee);
  
        // Push the result for the current iteration
        results.push({
          message: `OEE calculations completed successfully for Line ${Line} and Machine ${machine}.`,
          date1,
          date2,
          Line,
          machine,
          availability,
          performance,
          quality,
          oee
        });
      }
  
      // Send the aggregated results as the response
      res.status(200).json(results);
  
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    } finally {
      // Close database connection
      // await sql.close();
    }
  });
  

  

// Oee line wise
  app.post('/api/calculateOEELineWise', async (req, res) => {
    const dataArray = req.body;
  
    console.log('Received request body:', dataArray);
  
    try {
      // Connect to the database
      const pool = await sql.connect(dbConfig);
  
      // Convert 24 hours into minutes and store it in variable1
      const variable1 = 24 * 60;
  
      // Select tea_time and lunch_time from shift_master table and subtract it from variable1
      const shiftData = await pool.request().query(`
        SELECT SUM(tea_time) AS tea_time, SUM(lunch_time) AS lunch_time
        FROM [Garware].[dbo].[shift_master]
      `);
  
      console.log("variable1:", variable1);
      if (shiftData.recordset.length === 0) {
        res.status(404).json({ message: 'No shift data found.' });
        return;
      }
  
      const { tea_time, lunch_time } = shiftData.recordset[0];
      console.log("tea_time + lunch_time:", tea_time, lunch_time);
      const variable2 = variable1 - (tea_time + lunch_time);
      console.log("variable2:", variable2);
  
      // Calculate Availability
      const availability = variable2 / variable1;
  
      const results = [];
  
      for (const data of dataArray) {
        const { date1, date2, Line } = data;
  
        // Calculate Performance
        const targetData = await pool.request()
          .input('Line', sql.Int, Line)
          .query(`
            SELECT SUM(Target_in_mtr) AS totalTarget
            FROM [Garware].[dbo].[master_set_machine_target]
            WHERE line_no = @Line
          `);
  
        if (targetData.recordset.length === 0) {
          res.status(404).json({ message: 'No target data found for the given line.' });
          return;
        }
  
        const variable3 = targetData.recordset[0].totalTarget;
        console.log("variable3:", variable3);
  
        // Select live count data based on the shift start and end times
        const liveCountData = await pool.request()
          .input('Line', sql.Int, Line)
          .input('date1', sql.DateTime, date1)
          .input('date2', sql.DateTime, date2)
          .query(`
            SELECT SUM(final_live_count) AS totalLiveCount
            FROM [Garware].[dbo].[atual_master_live]
            WHERE CONVERT(date, shift_start) >= @date1 
            AND CONVERT(date, shift_end) <= @date2
            AND line_no = @Line
          `);
  
        if (liveCountData.recordset.length === 0) {
          res.status(404).json({ message: 'No live count data found for the given date range and line.' });
          return;
        }
  
        const variable4 = liveCountData.recordset[0].totalLiveCount;
        console.log("variable4:", variable4);
        const performance = variable4 / variable3;
  
        // Calculate Quality
        const variable5 = 0.9 * variable4;
        console.log("variable5:", variable5);
        const quality = variable5 / variable4;
  
        // Calculate OEE as a percentage
        const oee = (availability * performance * quality) * 100;
  
        console.log('Availability:', availability);
        console.log('Performance:', performance);
        console.log('Quality:', quality);
        console.log('OEE:', oee);
  
        results.push({
          date1,
          date2,
          Line,
          availability,
          performance,
          quality,
          oee
        });
      }
  
      res.status(200).json({
        message: 'OEE calculations completed successfully. | Line Wise',
        data: results
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    } finally {
      // Close database connection
      sql.close();
    }
  });

  



// Oee all plant
  app.post('/api/calculateOEEAllPlant', async (req, res) => {
    const dataArray = req.body;
  
    console.log('Received request body:', dataArray);
  
    try {
      // Connect to the database
      const pool = await sql.connect(dbConfig);
  
      // Convert 24 hours into minutes and store it in variable1
      const variable1 = 24 * 60;
  
      // Select tea_time and lunch_time from shift_master table and subtract it from variable1
      const shiftData = await pool.request().query(`
        SELECT SUM(tea_time) AS tea_time, SUM(lunch_time) AS lunch_time
        FROM [Garware].[dbo].[shift_master]
      `);
  
      console.log("variable1:", variable1);
      if (shiftData.recordset.length === 0) {
        res.status(404).json({ message: 'No shift data found.' });
        return;
      }
  
      const { tea_time, lunch_time } = shiftData.recordset[0];
      console.log("tea_time + lunch_time:", tea_time, lunch_time);
      const variable2 = variable1 - (tea_time + lunch_time);
      console.log("variable2:", variable2);
  
      // Calculate Availability
      const availability = variable2 / variable1;
  
      const results = [];
  
      for (const data of dataArray) {
        const { date1, date2 } = data;
  
        // Calculate Performance
        const targetData = await pool.request().query(`
          SELECT SUM(Target_in_mtr) AS totalTarget
          FROM [Garware].[dbo].[master_set_machine_target]
        `);
  
        if (targetData.recordset.length === 0) {
          res.status(404).json({ message: 'No target data found for the given line.' });
          return;
        }
  
        const variable3 = targetData.recordset[0].totalTarget;
        console.log("variable3:", variable3);
  
        // Select live count data based on the shift start and end times
        const liveCountData = await pool.request()
          .input('date1', sql.DateTime, date1)
          .input('date2', sql.DateTime, date2)
          .query(`
            SELECT SUM(final_live_count) AS totalLiveCount
            FROM [Garware].[dbo].[atual_master_live]
            WHERE CONVERT(date, shift_start) >= @date1 
            AND CONVERT(date, shift_end) <= @date2
          `);
  
        if (liveCountData.recordset.length === 0) {
          res.status(404).json({ message: 'No live count data found for the given date range and line.' });
          return;
        }
  
        const variable4 = liveCountData.recordset[0].totalLiveCount;
        console.log("variable4:", variable4);
        const performance = variable4 / variable3;
  
        // Calculate Quality
        const variable5 = 0.9 * variable4;
        console.log("variable5:", variable5);
        const quality = variable5 / variable4;
  
        // Calculate OEE as a percentage
        const oee = (availability * performance * quality) * 100;
  
        console.log('Availability:', availability);
        console.log('Performance:', performance);
        console.log('Quality:', quality);
        console.log('OEE:', oee);
  
        results.push({
          date1,
          date2,
          availability,
          performance,
          quality,
          oee
        });
      }
  
      res.status(200).json({
        message: 'OEE calculations completed successfully. | All Plants',
        data: results
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    } finally {
      // Close database connection
      sql.close();
    }
  });
  
  


// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

