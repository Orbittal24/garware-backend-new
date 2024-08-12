const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
// const sql = require('mssql');
const cors = require('cors');
const { format } = require('date-fns');
// const { sql, poolPromise } = require('./config');
const app = express();
const port = 3001; // Choose any available port

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



// Fnction  to  get  column name  L1M1
// Dynamic Column name, [Line_Machine_Pulse_Count1]
function getMachineColumn(Esp,machineId) {
  return `L1E${Esp}M${machineId}`;
}


// Main array for Actual Run Time
const previousPulseCounts = {}; // { machineId: { pulseCount: number, startTime: Date } }



let machineData = [];

// for data receive from ESP and perform operation on actual_master_live database table
app.post('/api/data', async (req, res) => {
  if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Only POST requests allowed' });
  }

  const machinesData = req.body; // Assuming it's an array of { machineId, machinePulseCount, Esp, Line }

  console.log("Machine data:", machinesData);

  
  try {
const pool = await sql.connect(dbConfig)
   
      let messages = [];

      try {
          let machinesDataArray;
          if (Array.isArray(machinesData)) {
              machinesDataArray = machinesData;
          } else if (typeof machinesData === 'object' && machinesData !== null) {
              machinesDataArray = [machinesData];
          } else {
              throw new Error('Invalid machinesData format');
          }

          for (const machine of machinesDataArray) {
              const machineId = machine.machineId;
              const machinePulseCount = machine.machinePulseCount;
              const Esp = machine.Esp;
              // const Line = machine.Line;



              
// for line
              const line_check = await pool.request()
              .input('machine_number', sql.Int, machineId)
              .input('esp_no', sql.Int, Esp)
              .query(`SELECT * FROM [Garware].[dbo].[mater_line_machine_esp] 
                      WHERE 
                          machine_number = @machine_number
                          AND esp_no = @esp_no`);

                          const Line = line_check.recordset[0].line_number;
                          if (line_check.recordset.length > 0) {
                            const Line = line_check.recordset[0].line_number;
                            console.log('Line number:', Line); 
                          } else {
                            console.log('No matching record found in mater_line_machine_esp');
                          }

                          const actual_machine_no = line_check.recordset[0].actual_machine_no;

                          console.log(' actual_machine_no:', actual_machine_no); 

// for construction
                          const construction_check = await pool.request()
                          .input('machine_no', sql.Int, machineId)
                          .input('Line', sql.Int, Line)
                          .query(`SELECT TOP 1 * FROM [Garware].[dbo].[master_set_production] 
                                  WHERE 
                                      machine_no = @machine_no AND
                                      line_no = @Line
                                       ORDER BY sr_no DESC
                                      `);
            
                                      const construction = construction_check.recordset[0].construction;
                                      if (construction_check.recordset.length > 0) {
                                        const construction = construction_check.recordset[0].construction;
                                        console.log('construction type:', construction); 
                                      } else {
                                        console.log('No matching record found in mater_line_machine_esp');
                                      }
            
            


// Update machine status to 'online' and record timestamp

// Capture the current local time
// Get current date and time in local timezone (IST)
const now = new Date();
const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

// Convert local time to ISO 8601 format (UTC)
const localTimeISO = localTime.toISOString();

console.log("Current Local Time in ISO Format (IST):", localTimeISO);

// Adjust for IST manually by adding 5 hours and 30 minutes
const istOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5 hours 30 minutes in milliseconds
const adjustedLocalTime = new Date(localTime.getTime() + istOffset);
const adjustedLocalTimeISO = adjustedLocalTime.toISOString();

console.log("Adjusted Local Time in ISO Format (IST):", adjustedLocalTimeISO);
console.log("line.......:",Line)
await pool.request()
    .input('line_number', sql.VarChar, Line)
    .input('actual_machine_no', sql.Int, actual_machine_no)
    .input('machine_number', sql.VarChar, machineId)
    .input('esp_no', sql.VarChar, Esp)
    .input('status', sql.VarChar, 'online')
    .input('update_status_time', sql.DateTime2, adjustedLocalTimeISO) // Adjusted IST timestamp
    .query(`MERGE [Garware].[dbo].[master_machine_status] AS target
            USING (SELECT @line_number AS line_number, @machine_number AS machine_number, @esp_no AS esp_no) AS source
            ON target.line_number = source.line_number AND target.machine_number = source.machine_number AND target.esp_no = source.esp_no
            WHEN MATCHED THEN
              UPDATE SET status = @status, update_status_time = @update_status_time
            WHEN NOT MATCHED THEN
              INSERT (line_number, machine_number, esp_no, status, update_status_time, actual_machine_no)
              VALUES (@line_number, @machine_number, @esp_no, @status, @update_status_time, @actual_machine_no);
    `);
   
             
              

       
// Get current date and time in local timezone (IST)
const currentHours = String(now.getHours()).padStart(2, '0');
const currentMinutes = String(now.getMinutes()).padStart(2, '0');
const currentSeconds = String(now.getSeconds()).padStart(2, '0');
const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
console.log("Current Time:", currentTimeString);

const currentDateString = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
console.log("Current Date:", currentDateString);

const result = await pool.request()
.query(`SELECT * FROM [Garware].[dbo].[shift_master]`);
const shifts = result.recordset;

let currentShift = null;

shifts.forEach(shift => {
  const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
  const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
  console.log("Start Time:", startTime);
  console.log("End Time:", endTime);

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
  console.log('Current Shift:', currentShift);

  // Determine the correct start and end datetimes for the current shift
  let shiftStartDate = new Date(now);
  let shiftEndDate = new Date(now);

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

  console.log('Shift Start Date Formatted:', shiftStartDateISO);
  console.log('Shift End Date Formatted:', shiftEndDateISO);

  console.log("Line",Line)
  console.log("actual_machine_no",actual_machine_no)
// Get the calculated_in_mtr value from master_set_machine_target
const targetResult = await pool.request()
.input('line_no', sql.Int, Line)
.input('machine_no', sql.Int, actual_machine_no)
.query(`SELECT calculate_in_mtr 
        FROM [Garware].[dbo].[master_set_machine_target] 
        WHERE line_no = @line_no 
          AND machine_no = @machine_no`);

          console.log('Target Result:', targetResult.recordset);
if (targetResult.recordset.length === 0) {
throw new Error('No matching entry found in master_set_machine_target');
}

const { calculate_in_mtr } = targetResult.recordset[0];

console.log('Target Result2:', targetResult.recordset);

  const actualResult = await pool.request()
    .input('machine_no', sql.Int, actual_machine_no)
    .input('line_no', sql.VarChar, Line)
    .input('Esp', sql.Int, Esp)
    .input('shift_start', sql.DateTime2, shiftStartDateISO)  // SQL Server will handle the ISO format
    .input('shift_end', sql.DateTime2, shiftEndDateISO)      // SQL Server will handle the ISO format
    .input('shift_no', sql.Int, currentShift.shift_no)
    .query(`SELECT * 
            FROM [Garware].[dbo].[atual_master_live]
            WHERE actual_machine_no = @machine_no 
              
               AND line_no = @line_no 
              AND shift_start = @shift_start 
              AND shift_end = @shift_end 
              AND shift_no = @shift_no`);

  if (actualResult.recordset.length > 0) {  //update & elased time insert



    const currentTime = new Date();
console.log('timeeeeeeeeeeee',currentTime);
const currentHour1 = currentTime.getHours();

if (!previousPulseCounts[machineId]) {
  previousPulseCounts[machineId] = {};
}

if (!previousPulseCounts[machineId][Esp]) {
  previousPulseCounts[machineId][Esp] = { pulseCount: machinePulseCount, startTime: currentTime };
} 


const previousPulseData = previousPulseCounts[machineId][Esp];

console.log('previousPulseData',previousPulseData)

if (machinePulseCount == previousPulseData.pulseCount && machinePulseCount == 1) {   //normal insert ==1

  if (previousPulseData.startTime) {
    // Calculate elapsed time since startTime
    const elapsedTime = (currentTime - previousPulseData.startTime) / 1000; // in seconds
    console.log(`Elapsed Time: ${elapsedTime} seconds`);




    // Online  Offline  Logic

    try {
      // Check if elapsed time is greater than 25 seconds
      if (elapsedTime > 25) {


console.log("Esp: ",Esp)
        await pool.request()
        .input('machine_no', sql.VarChar, machineId)
        .input('line_no', sql.VarChar, Line)
        .input('Esp', sql.Int, Esp)
        .input('shift_start', sql.DateTime2, shiftStartDateISO)
        .input('shift_end', sql.DateTime2, shiftEndDateISO)
        .input('actual_date', sql.DateTime2, adjustedLocalTimeISO)
        .input('live_count', sql.Int, machinePulseCount)
        .input('final_live_count', sql.Float, calculate_in_mtr)
        
       
        .input('construction', sql.VarChar, construction)
        .input('run_time', sql.Float, 0) // Adjust as needed
        .input('shift_no', sql.Int, currentShift.shift_no)
        .input('actual_machine_no', sql.Int, actual_machine_no)
        .query(`INSERT INTO [Garware].[dbo].[atual_master_live] 
                (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no) 
                VALUES 
                (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no)`);
    
          
console.log('Inserted  successfully   after  ')
                // await pool.request()
                // .input('machine_no', sql.VarChar, machineId)
                // .input('line_no', sql.VarChar, Line)
                // .input('shift_start', sql.DateTime2, shiftStartDateISO)
                // .input('shift_end', sql.DateTime2, shiftEndDateISO)
                // .input('shift_no', sql.Int, currentShift.shift_no)
                // .input('machinePulseCount', sql.Int, machinePulseCount)
                // .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
                // .query(`
                //   ;WITH LatestRecord AS (
                //       SELECT TOP 1 * 
                //       FROM [Garware].[dbo].[atual_master_live]
                //       WHERE machine_no = @machine_no 
                //         AND line_no = @line_no 
                //       ORDER BY sr_no DESC
                //   )
                //   UPDATE LatestRecord
                //   SET live_count = live_count + @machinePulseCount,
                //       final_live_count = final_live_count + @calculate_in_mtr
                // `);
        // Update status to offline
        // await sql.query`
        //   UPDATE [Garware].[dbo].[OutputTable]
        //   SET status = 'offline'
        //   WHERE MachineId = ${machineId} and CONVERT(date, entry_date) = CONVERT(date, ${currentTime})`;
        // console.log(`Machine ID: ${machineId} is offline`);
      } else{

console.log('Elapseddddddddd_time ',elapsedTime)
console.log('ddddddddddfffffffffffffffffff ',actual_machine_no)



        console.log('Updating  existing   record  successfully');
        await pool.request()
  .input('machine_no', sql.Int, actual_machine_no)
  .input('line_no', sql.VarChar, Line)
  .input('Esp', sql.Int, Esp)
  .input('shift_start', sql.DateTime2, shiftStartDateISO)
  .input('shift_end', sql.DateTime2, shiftEndDateISO)
  .input('shift_no', sql.Int, currentShift.shift_no)
  .input('machinePulseCount', sql.Int, machinePulseCount)
  .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
  .input('elapsedTime', sql.Float, elapsedTime)
  .query(`
    ;WITH LatestRecord AS (
        SELECT TOP 1 * 
        FROM [Garware].[dbo].[atual_master_live]
        WHERE machine_no = @machine_no 
          AND line_no = @line_no 
           ORDER BY sr_no DESC
    )
    UPDATE LatestRecord
    SET live_count = live_count + @machinePulseCount,
        final_live_count = final_live_count + @calculate_in_mtr,
        run_time = run_time + @elapsedTime

  `);
      }
    } catch (error) {
      console.error(`Error Inserting  updated  construction for Machine ID: ${machineId}`, error);
    }

    
    
  }else{

  }

  // Set startTime to current time for the new idle period
  previousPulseData.startTime = currentTime;



}   //normal insert ==1 

else {
  // No change needed if pulse count has not increased

  console.log('No  previous  count  ');
// await pool.request()
//   .input('machine_no', sql.VarChar, machineId)
//   .input('line_no', sql.VarChar, Line)
//   .input('shift_start', sql.DateTime2, shiftStartDateISO)
//   .input('shift_end', sql.DateTime2, shiftEndDateISO)
//   .input('shift_no', sql.Int, currentShift.shift_no)
//   .input('machinePulseCount', sql.Int, machinePulseCount)
//   .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
//   .query(`
//     ;WITH LatestRecord AS (
//         SELECT TOP 1 * 
//         FROM [Garware].[dbo].[atual_master_live]
//         WHERE machine_no = @machine_no 
//           AND line_no = @line_no 
//         ORDER BY sr_no DESC
//     )
//     UPDATE LatestRecord
//     SET live_count = live_count + @machinePulseCount,
//         final_live_count = final_live_count + @calculate_in_mtr
//   `);

  // console.log(`No pulse count increase for Machine ID: ${machineId}. No idle time update.`);
}

// Update the stored pulse count for the machine
previousPulseData.pulseCount = machinePulseCount;




  
    // console.log('Updating existing record');
    // await pool.request()
    //   .input('machine_no', sql.VarChar, machineId)
    //   .input('line_no', sql.VarChar, Line)
    //   .input('shift_start', sql.DateTime2, shiftStartDateISO)
    //   .input('shift_end', sql.DateTime2, shiftEndDateISO)
    //   .input('shift_no', sql.Int, currentShift.shift_no)
    //   .input('machinePulseCount', sql.Int, machinePulseCount)
    //   .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
    //   .query(`UPDATE [Garware].[dbo].[atual_master_live] 
    //           SET live_count = live_count + @machinePulseCount,
    //             final_live_count = final_live_count + @calculate_in_mtr
    //           WHERE machine_no = @machine_no 
    //             AND line_no = @line_no 
    //             AND shift_start = @shift_start 
    //             AND shift_end = @shift_end 
    //             AND shift_no = @shift_no`);
  }    //update & elased time insert


   else {    //normal insert



    const currentTime = new Date();
    console.log('timeeeeeeeeeeee',currentTime);
    const currentHour1 = currentTime.getHours();

    console.log('espppppppppppppppppppppppppppppppppp',Esp,machineId);
    
    if (!previousPulseCounts[machineId]) {
      previousPulseCounts[machineId] = {};
    }

    if (!previousPulseCounts[machineId][Esp]) {
      previousPulseCounts[machineId][Esp] = { pulseCount: machinePulseCount, startTime: currentTime };
    } 

 

    console.log('Inserting new record');
    await pool.request()
      .input('machine_no', sql.VarChar, machineId)
      .input('line_no', sql.VarChar, Line)
      .input('Esp', sql.Int, Esp)
      .input('shift_start', sql.DateTime2, shiftStartDateISO)
      .input('shift_end', sql.DateTime2, shiftEndDateISO)
      .input('actual_date', sql.DateTime2, adjustedLocalTimeISO)
      .input('live_count', sql.Int, machinePulseCount)
      .input('final_live_count', sql.Float, calculate_in_mtr)
      
      
      .input('construction', sql.VarChar, construction)
      .input('run_time', sql.Float, 0) // Adjust as needed
      .input('shift_no', sql.Int, currentShift.shift_no)
      .input('actual_machine_no', sql.Int, actual_machine_no)
      .query(`INSERT INTO [Garware].[dbo].[atual_master_live] 
              (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no) 
              VALUES 
              (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no)`);
  }   //normal insert



  // shifts.forEach(shift => {
  //   const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
  //   const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
  //   console.log("Start shift Time:", startTime);
  //   console.log("End shift Time:", endTime);
  
  //   if (endTime < startTime) { // Shift spans midnight
  //     if (currentTimeString >= startTime || currentTimeString <= endTime) {
  //       currentShift = shift;
  //     }
  //   } else { // Regular shift
  //     if (currentTimeString >= startTime && currentTimeString <= endTime) {
  //       currentShift = shift;
  //     }
  //   }
  // });
  
 


  const shiftnoResult = await pool.request()
      .query(`
        SELECT COUNT(sr_no) AS sr_no
        FROM [Garware].[dbo].[shift_master]
      `);
const shifts = shiftnoResult.recordset[0].sr_no;

console.log('shifts:', shifts);


console.log("line",Line)

console.log("machine_no",machineId)
const target = await pool.request()
  .input('machine_no', sql.Int, actual_machine_no)
  .input('line_no', sql.Int, Line)
  .query(`
    SELECT 
      Target_in_mtr
    FROM [Garware].[dbo].[master_set_machine_target]
    WHERE line_no = @line_no AND machine_no = @machine_no
  `);
  const total_target = target.recordset[0].Target_in_mtr;



  const current_shift_target = total_target / shifts
  console.log("current_shift_target: ",current_shift_target)
  console.log('Shift Start Date Formatted:', shiftStartDateISO);
  console.log('Shift End Date Formatted:', shiftEndDateISO);


  const checklivecountmtr = await pool.request()
  .input('machine_no', sql.VarChar, machineId)
  .input('Esp', sql.VarChar, Esp)
  .input('line_no', sql.VarChar, Line)
  .input('shift_start', sql.DateTime2, shiftStartDateISO)
  .input('shift_end', sql.DateTime2, shiftEndDateISO)
  .input('shift_no', sql.Int, currentShift.shift_no)
  .query(`SELECT SUM(final_live_count) AS total_final_live_count
          FROM [Garware].[dbo].[atual_master_live] 
          WHERE machine_no = @machine_no 
         AND esp = @Esp
            AND line_no = @line_no 
            AND shift_start = @shift_start 
            AND shift_end = @shift_end 
            AND shift_no = @shift_no`);



                                
                  if (current_shift_target > 0) {
                      const actual = checklivecountmtr.recordset[0];
                      if (actual.total_final_live_count >= current_shift_target) {
                          messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);
                        //   const messages = [
                        //     `Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`
                        // ];
                        // await sendNotification(messages);
                        
                        
                        
              }
          }
      } else {
                  console.log(`No matching plan found for Machine ID: ${machineId} and Line: ${Line}`);
                  // await pool.rollback();
                  return res.status(400).json({ message: 'No matching plan found.' });
              }
          }

          // await pool.commit();
          res.status(200).json({ message: 'Data inserted/updated successfully.', details: messages });
      } catch (err) {
          // await pool.rollback();
          console.error('Error during pool:', err);
          res.status(500).json({ message: 'Internal Server Error' });
      }
  } catch (err) {
      console.error('Error connecting to database:', err);
      res.status(500).json({ message: 'Internal Server Error' });
  } finally {
      // sql.close();
  }
});
          

// for update construction if changed
app.post('/api/updateConstruction', async (req, res) => {
  const { line_no, machine_no, construction, start_time, end_time } = req.body;
  console.log("data received:", line_no, machine_no, construction, start_time, end_time)

  if (!line_no || !machine_no || !construction || !start_time || !end_time) {
    return res.status(400).send('Missing required fields');
  }

  try {

    await sql.connect(dbConfig);

    const request = new sql.Request();

    const query = `
      UPDATE [Garware].[dbo].[atual_master_live]
      SET construction = @construction
      WHERE actual_machine_no = @machine_no AND
      line_no = @line_no AND
      actual_date BETWEEN @start_time AND @end_time
       ;
    `;

    request.input('line_no', sql.Int, line_no);
    request.input('machine_no', sql.Int, machine_no);
    request.input('construction', sql.NVarChar, construction);
    request.input('start_time', sql.DateTime2, start_time);
    request.input('end_time', sql.DateTime2, end_time);

    const result = await request.query(query);
    console.log("update result:", result)


     // Insert the received data into the master_update_production table
     const insertQuery = `
     INSERT INTO [Garware].[dbo].[master_update_production] 
     (line_no, machine_no, construction, start_time, end_time)
     VALUES (@line_no, @machine_no, @construction, @start_time, @end_time);
   `;

   const insertResult = await request.query(insertQuery);
   console.log("Insert result:", insertResult);


    res.status(200).send('Update successful');
  } catch (err) {
    console.error('Error executing query: ', err);
    res.status(500).send('Internal Server Error');
  }
});



// Conversion factor: 1 inch = 0.0254 meters
const INCH_TO_METER = 0.0254;
const PI = Math.PI;

// calculate meter -/pulse from pulley diameter
app.post('/api/calculate_target_mtr', async (req, res) => {
  const entries = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).send('Entries should be a non-empty array');
  }

  try {
    await sql.connect(dbConfig);
    const transaction = new sql.Transaction();

    try {
      await transaction.begin();

      for (const entry of entries) {
        const { line_no, machine_no, pulley_diameter, entry_date, target_in_mtr, rpm } = entry;

        if (!line_no || !machine_no || !pulley_diameter || !entry_date || !target_in_mtr || !rpm) {
          throw new Error('Missing required fields');
        }

        // Calculate circumference in inches
        const circumference_in_inches = PI * pulley_diameter;

        // Convert circumference to meters
        const calculate_in_mtr = circumference_in_inches * INCH_TO_METER;

        const existingEntry = await transaction.request()
        .input('line_no', sql.Int, line_no)
        .input('machine_no', sql.Int, machine_no)
        .input('entry_date', sql.Date, entry_date)
        .query(`SELECT * FROM [Garware].[dbo].[master_set_machine_target] 
                WHERE line_no = @line_no AND machine_no = @machine_no`);

      if (existingEntry.recordset.length > 0) {
        // Update existing entry
        await transaction.request()
          .input('line_no', sql.Int, line_no)
          .input('machine_no', sql.Int, machine_no)
          .input('pulley_diameter', sql.Float, pulley_diameter)
          .input('entry_date', sql.Date, entry_date)
          .input('target_in_mtr', sql.Float, target_in_mtr)
          .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
          .input('rpm', sql.Int, rpm)
          .query(`UPDATE [Garware].[dbo].[master_set_machine_target]
                  SET pulley_diameter = @pulley_diameter, 
                      target_in_mtr = @target_in_mtr, 
                      calculate_in_mtr = @calculate_in_mtr, 
                      rpm = @rpm
                  WHERE line_no = @line_no AND machine_no = @machine_no`);
      } else {
        // Insert new entry
        await transaction.request()
          .input('line_no', sql.Int, line_no)
          .input('machine_no', sql.Int, machine_no)
          .input('pulley_diameter', sql.Float, pulley_diameter)
          .input('entry_date', sql.Date, entry_date)
          .input('target_in_mtr', sql.Float, target_in_mtr)
          .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
          .input('rpm', sql.Int, rpm)
          .query(`INSERT INTO [Garware].[dbo].[master_set_machine_target] 
                  (line_no, machine_no, pulley_diameter, entry_date, target_in_mtr, calculate_in_mtr, rpm) 
                  VALUES (@line_no, @machine_no, @pulley_diameter, @entry_date, @target_in_mtr, @calculate_in_mtr, @rpm)`);
      }
    }

      await transaction.commit();
      res.status(200).send('Data inserted successfully');
    } catch (err) {
      await transaction.rollback();
      console.error('Error during transaction:', err);
      res.status(500).send('Transaction failed');
    }
  } catch (err) {
    console.error('SQL connection error:', err);
    res.status(500).send('SQL connection error');
  }
});


// LENGTH COUNTERS (How Many Threads Generate in Mtr/KG)
// calculate length counters for machine
app.post('/api/length_counters', async (req, res) => {
  const { Line, machine, actualDate } = req.body;

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);


    let query;
    let request = await pool.request()
      .input('Line', sql.Int, Line)
      .input('actualDate', sql.Date, actualDate);

    if (machine === 'all') {
      query = `
        SELECT actual_machine_no, SUM(final_live_count) AS totalLiveCount
        FROM [Garware].[dbo].[atual_master_live]
        WHERE line_no = @Line AND CONVERT(date, actual_date) = @actualDate
        GROUP BY actual_machine_no
      `;
    } else {
      query = `
        SELECT SUM(final_live_count) AS totalLiveCount
        FROM [Garware].[dbo].[atual_master_live]
        WHERE line_no = @Line AND actual_machine_no = @machine AND CONVERT(date, actual_date) = @actualDate
      `;
      request = request.input('machine', sql.Int, machine);
    }

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      res.status(404).json({ message: 'No data found for the given criteria.' });
      return;
    }

    res.status(200).json({ message: 'Data retrieved successfully.', result: result.recordset });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});

// calculate lengeth counters for construction
app.post('/api/construction_length_counters', async (req, res) => {
  const { construction, actualDate } = req.body;

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    let query1 = `
      SELECT meter_per_kg 
      FROM [Garware].[dbo].[master_construction_details]
      WHERE construction_name = @construction 
    `;
    const request1 = await pool.request()
    .input('construction', sql.VarChar, construction)
    const result1 = await request1.query(query1);
     const mtr_kg = result1.recordset[0].meter_per_kg
    console.log("mtr_kg:", mtr_kg)


    let query = `
      SELECT SUM(final_live_count) AS totalLiveCount
      FROM [Garware].[dbo].[atual_master_live]
      WHERE construction = @construction AND CONVERT(date, actual_date) = @actualDate
    `;

    const request = await pool.request()
      .input('construction', sql.VarChar, construction)
      .input('actualDate', sql.Date, actualDate);

    const result = await request.query(query);
    const mtr = result.recordset[0].totalLiveCount
    console.log("mtr:", mtr)

    const kg = mtr_kg / mtr
    console.log("kg: ", kg)
    if (result.recordset.length === 0) {
      res.status(404).json({ message: 'No data found for the given criteria.' });
      return;
    }

    const mtrFormatted = mtr.toFixed(2);
    const kgFormatted = kg.toFixed(2);

    res.status(200).json({ 
      message: 'Data retrieved successfully for construction', 
      mtr: parseFloat(mtrFormatted), 
      kg: parseFloat(kgFormatted) 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});


// RUN - HOURS api's
// for calculate run hrs all plant (Line Wise) (Shift Wise) 
app.post('/api/run_hrs_all_line_shift', async (req, res) => {
  const { date } = req.body;
  
  console.log('Received request body:', req.body);
  

  
  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

// Capture the current local time
// Get current date and time in local timezone (IST)
const now = new Date();
const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

// Convert local time to ISO 8601 format (UTC)
const localTimeISO = localTime.toISOString();

console.log("Current Local Time in ISO Format (IST):", localTimeISO);

// Adjust for IST manually by adding 5 hours and 30 minutes
const istOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5 hours 30 minutes in milliseconds
const adjustedLocalTime = new Date(localTime.getTime() + istOffset);
const adjustedLocalTimeISO = adjustedLocalTime.toISOString();

    // Get current date and time in local timezone (IST)
const currentHours = String(now.getHours()).padStart(2, '0');
const currentMinutes = String(now.getMinutes()).padStart(2, '0');
const currentSeconds = String(now.getSeconds()).padStart(2, '0');
const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
console.log("Current Time:", currentTimeString);

const currentDateString = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
console.log("Current Date:", currentDateString);

const result = await pool.request()
.query(`SELECT * FROM [Garware].[dbo].[shift_master]`);
const shifts = result.recordset;

let currentShift = null;

shifts.forEach(shift => {
  const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
  const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
  console.log("Start Time:", startTime);
  console.log("End Time:", endTime);

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
// console.log("currentShift: ",currentShift)

if (currentShift) {
  console.log('Current Shift:', currentShift);

  // Determine the correct start and end datetimes for the current shift
  let shiftStartDate = new Date(now);
  let shiftEndDate = new Date(now);

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

  console.log('Shift Start Date Formatted:', shiftStartDateISO);
  console.log('Shift End Date Formatted:', shiftEndDateISO);

  const liveCountData = await pool.request()
      
      .input('date1', sql.DateTime, shiftStartDateISO)
      .input('date2', sql.DateTime, shiftEndDateISO)
      .query(`
        SELECT line_no, SUM(run_time) AS totalrun_time
        FROM [Garware].[dbo].[atual_master_live]
        WHERE  shift_start >= @date1 
        AND shift_end <= @date2
                GROUP BY line_no
      `);

    if (liveCountData.recordset.length === 0) {
      res.status(404).json({ message: 'No live count data found for the given date range and line.' });
      return;
    }

//     const totalrun_time = liveCountData.recordset;
// console.log("totalrun_time:", totalrun_time)

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

console.log("totalrun_time in minutes and hours:", totalrun_time);

    res.status(200).json({ 
      message: 'RUN HRS. | all plant (Line Wise) (Shift Wise) ',
      totalrun_time
    });
  }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});

// for calculate run hrs Line-Machine (Line Machine Wise) (Shift Wise) 
app.post('/api/run_hrs_One_line_shift', async (req, res) => {
  const { date, Line } = req.body;
  
  console.log('Received request body:', req.body);
  

  
  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

// Capture the current local time
// Get current date and time in local timezone (IST)
const now = new Date();
const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

// Convert local time to ISO 8601 format (UTC)
const localTimeISO = localTime.toISOString();

console.log("Current Local Time in ISO Format (IST):", localTimeISO);

// Adjust for IST manually by adding 5 hours and 30 minutes
const istOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5 hours 30 minutes in milliseconds
const adjustedLocalTime = new Date(localTime.getTime() + istOffset);
const adjustedLocalTimeISO = adjustedLocalTime.toISOString();

    // Get current date and time in local timezone (IST)
const currentHours = String(now.getHours()).padStart(2, '0');
const currentMinutes = String(now.getMinutes()).padStart(2, '0');
const currentSeconds = String(now.getSeconds()).padStart(2, '0');
const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
console.log("Current Time:", currentTimeString);

const currentDateString = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
console.log("Current Date:", currentDateString);

const result = await pool.request()
.query(`SELECT * FROM [Garware].[dbo].[shift_master]`);
const shifts = result.recordset;

let currentShift = null;

shifts.forEach(shift => {
  const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
  const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
  console.log("Start Time:", startTime);
  console.log("End Time:", endTime);

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
// console.log("currentShift: ",currentShift)

if (currentShift) {
  console.log('Current Shift:', currentShift);

  // Determine the correct start and end datetimes for the current shift
  let shiftStartDate = new Date(now);
  let shiftEndDate = new Date(now);

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

  console.log('Shift Start Date Formatted:', shiftStartDateISO);
  console.log('Shift End Date Formatted:', shiftEndDateISO);

  const liveCountData = await pool.request()
      
      .input('date1', sql.DateTime, shiftStartDateISO)
      .input('date2', sql.DateTime, shiftEndDateISO)
      .input('Line', sql.Int, Line)
      .query(`
        SELECT actual_machine_no, SUM(run_time) AS totalrun_time
        FROM [Garware].[dbo].[atual_master_live]
        WHERE  shift_start >= @date1 
        AND shift_end <= @date2
                AND line_no = @Line
                 GROUP BY actual_machine_no
      `);

    if (liveCountData.recordset.length === 0) {
      res.status(404).json({ message: 'No live count data found for the given date range and line.' });
      return;
    }

//     const totalrun_time = liveCountData.recordset;
// console.log("totalrun_time:", totalrun_time)

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

console.log("totalrun_time in minutes and hours:", totalrun_time);




   

    res.status(200).json({ 
      message: 'RUN HRS. | Line-Machine (Line Machine Wise Shift Wise)',
      totalrun_time
    });
  }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});

// Endpoint to calculate run hours for all plants (line-wise) for the entire day
app.post('/api/run_hrs_all_plant_wholeDay', async (req, res) => {
  const { actualDate } = req.body;

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Fetch the live count data based on the provided date
    const liveCountData = await pool.request()
      .input('actualDate', sql.DateTime, actualDate)
      .query(`
        SELECT line_no, SUM(run_time) AS totalrun_time
        FROM [Garware].[dbo].[atual_master_live]
        WHERE  CONVERT(Date, shift_start) = @actualDate 
        GROUP BY line_no
      `);

    // Check if any data was found
    if (liveCountData.recordset.length === 0) {
      res.status(404).json({ message: 'No live count data found for the given date.' });
      return;
    }

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

    console.log("Total run time in minutes and hours:", totalrun_time);

    // Send the response with the calculated run hours
    res.status(200).json({ 
      message: 'RUN HRS. | all plants (line-wise) for the entire day',
      totalrun_time
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    sql.close();
  }
});

// Endpoint to calculate run hours for Line machine (line-machine wise) for the entire day
app.post('/api/run_hrs_Line_machine_wholeDay', async (req, res) => {
  const { actualDate, Line } = req.body;

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Fetch the live count data based on the provided date
    const liveCountData = await pool.request()
      .input('actualDate', sql.DateTime, actualDate)
      .input('Line', sql.Int, Line)
      .query(`
        SELECT  actual_machine_no, SUM(run_time) AS totalrun_time
        FROM [Garware].[dbo].[atual_master_live]
        WHERE  CONVERT(Date, shift_start) = @actualDate 
        AND line_no  = @Line
        GROUP BY actual_machine_no
      `);

    // Check if any data was found
    if (liveCountData.recordset.length === 0) {
      res.status(404).json({ message: 'No live count data found for the given date.' });
      return;
    }

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

    console.log("Total run time in minutes and hours:", totalrun_time);

    // Send the response with the calculated run hours
    res.status(200).json({ 
      message: 'RUN HRS. | Line machine (line-machine wise) for the entire day',
      totalrun_time
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    sql.close();
  }
});


// OEE api's
// for calculate OEE All Plant
app.post('/api/calculateOEEAllPlant', async (req, res) => {
  const { date1, date2 } = req.body;
  
  console.log('Received request body:', req.body);
  
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

    // Calculate Availability
    const availability = variable2 / variable1;

    // Calculate Performance
    const targetData = await pool.request()
     
      .query(`
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
        WHERE  CONVERT(date, shift_start) >= @date1 
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

    res.status(200).json({ 
      message: 'OEE calculations completed successfully. | All Plants',
      availability,
      performance,
      quality,
      oee
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});

// for calculate OEE Line Wise
app.post('/api/calculateOEELineWise', async (req, res) => {
  const { date1, date2, Line } = req.body;
  
  console.log('Received request body:', req.body);
  
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

    // Calculate Availability
    const availability = variable2 / variable1;

    // Calculate Performance
    const targetData = await pool.request()
    .input('Line', sql.Int, Line)
      .query(`
        SELECT SUM(Target_in_mtr) AS totalTarget
        FROM [Garware].[dbo].[master_set_machine_target]
        where line_no = @Line
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
        WHERE  CONVERT(date, shift_start) >= @date1 
        AND CONVERT(date, shift_end) <= @date2
        and line_no = @Line
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

    res.status(200).json({ 
      message: 'OEE calculations completed successfully. | Line Wise',
      availability,
      performance,
      quality,
      oee
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});


// for Token
const HARD_CODED_TOKEN = 'universal';

// Middleware to verify token 
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: 'No token provided.' });
  }

  if (token !== HARD_CODED_TOKEN) {
    return res.status(401).json({ message: 'Invalid token.' });
  }

  next();
};


// for calculate OEE Machine Wise
app.post('/api/calculateOEELine_machine', verifyToken, async (req, res) => {
  const { date1, date2, Line, machine } = req.body;
  
  console.log('Received request body:', req.body);
  
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

    // Calculate Availability
    const availability = variable2 / variable1;

    // Calculate Performance
    const targetData = await pool.request()
    .input('Line', sql.Int, Line)
    .input('machine', sql.Int, machine)
      .query(`
        SELECT SUM(Target_in_mtr) AS totalTarget
        FROM [Garware].[dbo].[master_set_machine_target]
        where line_no = @Line and machine_no = @machine
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
      .input('machine', sql.Int, machine)
      .query(`
        SELECT SUM(final_live_count) AS totalLiveCount
        FROM [Garware].[dbo].[atual_master_live]
        WHERE  CONVERT(date, shift_start) >= @date1 
        AND CONVERT(date, shift_end) <= @date2
        and line_no = @Line 
        and actual_machine_no = @machine
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

    res.status(200).json({ 
      message: 'OEE calculations completed successfully. | Machine Wise',
      availability,
      performance,
      quality,
      oee
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});



