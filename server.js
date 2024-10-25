const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const { format } = require('date-fns');
const { log } = require('console');
const app = express();
const port = 3001; // Choose any available port

app.use(cors({
  origin: 'http://192.168.10.168:3000',
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
  user: 'nsa',
  password: 'namashivay',
  server: '192.168.10.10',
  database: 'RUNHOURS',
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


// Check if the connection is successful or failed
dbconn.connect().then(() => {
  console.log('Database connection successful!');
}).catch(err => {
  console.error('Database connection failed:', err);
}).finally(() => {
  // Close the connection when you're done, to avoid leaking connections
  dbconn.close();
});



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
      let masterPulse = [];
      let atual_master_live_count1 = [];

      try {
          let machinesDataArray;
          if (Array.isArray(machinesData)) {
              machinesDataArray = machinesData;
          } else if (Array.isArray(machinesData.data) && machinesData.timestamp) {
            // Case where requestData has an array `data` and a `timestamp`
            const { data, timestamp } = machinesData;
    
            console.log('Processing:', data, 'with timestamp:', timestamp);
    
            // Now data is an array, loop through it
            machinesDataArray = data.map(item => ({
                Esp: item.Esp,
                machineId: item.machineId,
                machinePulseCount: item.machinePulseCount
            }));
    
        } else if (machinesData.machineId && machinesData.machinePulseCount && machinesData.Esp) {
          // Case where machinesData is a single object
          machinesDataArray = [machinesData]; // Convert the object into an array with one entry
      } else {
              throw new Error('Invalid machinesData format');
          }

          for (const machine of machinesDataArray) {
              const machineId = machine.machineId;
              const machinePulseCount = machine.machinePulseCount;
              const Esp = machine.Esp;
              const timestamp = machine.timestamp; // Retrieve the timestamp


              console.log('dataaaaaaaaaaaaaaaaaaaaa',machineId ,machinePulseCount);
              
              // const Line = machine.Line;



              
// for line
              const line_check = await pool.request()
              .input('machine_number', sql.Int, machineId)
              .input('esp_no', sql.Int, Esp)
              .query(`SELECT * FROM [RUNHOURS].[dbo].[mater_line_machine_esp] 
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
                          .input('machine_no', sql.Int, actual_machine_no)
                          .input('Line', sql.Int, Line)
                          .query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
                                  WHERE 
                                      machine_no = @machine_no AND
                                      line_no = @Line AND
                                       start_time <= GETDATE()
                                       ORDER BY sr_no DESC
                                      `);
            
                                      const construction = construction_check.recordset[0].construction;
                                      if (construction_check.recordset.length > 0) {
                                        const construction = construction_check.recordset[0].construction;
                                        console.log('construction type:', construction); 
                                      } else {
                                        console.log('No matching record found in mater_line_machine_esp');
                                      }
            
            
// for spool
const spool_check = await pool.request()
.input('machine_no', sql.Int, actual_machine_no)
.input('Line', sql.Int, Line)
.query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
        WHERE 
            machine_no = @machine_no AND
            line_no = @Line
             ORDER BY sr_no DESC
            `);

            const spool_date = spool_check.recordset[0].start_time;
            const spool = spool_check.recordset[0].spool_target;
            console.log("spool date:",spool_date )
            console.log('spool target:', spool); 
            // if (spool_check.recordset.length > 0) {
            //   const spool = spool_check.recordset[0].spool_target;
            //   console.log('spool target:', spool); 
            // } else {
            //   console.log('No matching record found in mater_line_machine_esp');
            // }
            

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
// await pool.request()
//     .input('line_number', sql.VarChar, Line)
//     .input('actual_machine_no', sql.Int, actual_machine_no)
//     .input('machine_number', sql.VarChar, machineId)
//     .input('esp_no', sql.VarChar, Esp)
//     .input('status', sql.VarChar, 'online')
//     .input('update_status_time', sql.DateTime2, adjustedLocalTimeISO) // Adjusted IST timestamp
//     .query(`MERGE [RUNHOURS].[dbo].[master_machine_status] AS target
//             USING (SELECT @line_number AS line_number, @machine_number AS machine_number, @esp_no AS esp_no, actual_machine_no) AS source
//             ON target.line_number = source.line_number AND target.machine_number = source.machine_number AND target.esp_no = source.esp_no 
//             WHEN MATCHED THEN
//               UPDATE SET status = @status, update_status_time = @update_status_time
//             WHEN NOT MATCHED THEN
//               INSERT (line_number, machine_number, esp_no, status, update_status_time, actual_machine_no)
//               VALUES (@line_number, @machine_number, @esp_no, @status, @update_status_time, @actual_machine_no);
//     `);
   
    await pool.request()
    .input('line_number', sql.VarChar, Line)
    .input('actual_machine_no', sql.Int, actual_machine_no)
    .input('machine_number', sql.VarChar, machineId)
    .input('esp_no', sql.VarChar, Esp)
    .input('status', sql.VarChar, 'online')
    .input('update_status_time', sql.DateTime2, adjustedLocalTimeISO) // Adjusted IST timestamp
    .query(`
        MERGE [RUNHOURS].[dbo].[master_machine_status] AS target
        USING (SELECT @line_number AS line_number, @machine_number AS machine_number, @esp_no AS esp_no, @actual_machine_no AS actual_machine_no) AS source
        ON target.line_number = source.line_number 
           AND target.machine_number = source.machine_number 
           AND target.esp_no = source.esp_no 
           AND target.actual_machine_no = source.actual_machine_no
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
.query(`SELECT * FROM [RUNHOURS].[dbo].[shift_master]`);
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
        FROM [RUNHOURS].[dbo].[master_set_machine_target] 
        WHERE line_no = @line_no 
          AND machine_no = @machine_no`);

          console.log('Target Result:', targetResult.recordset);
if (targetResult.recordset.length === 0) {
throw new Error('No matching entry found in master_set_machine_target');
}

const { calculate_in_mtr } = targetResult.recordset[0];

console.log('Target Result2:', targetResult.recordset);


//  target   

const shiftnoResult = await pool.request()
.query(`
  SELECT COUNT(shift_no) AS sr_no
  FROM [RUNHOURS].[dbo].[shift_master]
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
FROM [RUNHOURS].[dbo].[master_set_machine_target]
WHERE line_no = @line_no AND machine_no = @machine_no
`);
const total_target = target.recordset[0].Target_in_mtr;



const current_shift_target = total_target / shifts
console.log("current_shift_target: ",current_shift_target)






  const actualResult = await pool.request()
    .input('machine_no', sql.Int, actual_machine_no)
    .input('line_no', sql.VarChar, Line)
    .input('Esp', sql.Int, Esp)
    .input('shift_start', sql.DateTime2, shiftStartDateISO)  // SQL Server will handle the ISO format
    .input('shift_end', sql.DateTime2, shiftEndDateISO)      // SQL Server will handle the ISO format
    .input('shift_no', sql.Int, currentShift.shift_no)
    .query(`SELECT * 
            FROM [RUNHOURS].[dbo].[atual_master_live]
            WHERE actual_machine_no = @machine_no 
              
               AND line_no = @line_no 
              AND shift_start = @shift_start 
              AND shift_end = @shift_end 
              AND shift_no = @shift_no`);


              // const Target_spool  = await pool.request()
              // .input('machine_no', sql.Int, actual_machine_no)
              // .input('line_no', sql.VarChar, Line)
              //  .input('shift_no', sql.Int, currentShift.shift_no)
              // .query(`SELECT * 
              //         FROM [RUNHOURS].[dbo].[atual_master_live]
              //         WHERE actual_machine_no = @machine_no 
                        
              //            AND line_no = @line_no 
              //           AND shift_start = @shift_start 
              //           AND shift_end = @shift_end 
              //           AND shift_no = @shift_no`);




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
        .input('spool_count', sql.Float, calculate_in_mtr)
       
        .input('construction', sql.VarChar, construction)
        .input('run_time', sql.Float, 0) // Adjust as needed
        .input('shift_no', sql.Int, currentShift.shift_no)
        .input('actual_machine_no', sql.Int, actual_machine_no)
        .input('current_shift_target', sql.Float, current_shift_target)
        .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
                (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count) 
                VALUES 
                (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count)`);
    
          
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
                //       FROM [RUNHOURS].[dbo].[atual_master_live]
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
        //   UPDATE [RUNHOURS].[dbo].[OutputTable]
        //   SET status = 'offline'
        //   WHERE MachineId = ${machineId} and CONVERT(date, entry_date) = CONVERT(date, ${currentTime})`;
        // console.log(`Machine ID: ${machineId} is offline`);
      } else{

console.log('Elapseddddddddd_time ',elapsedTime)
console.log('ddddddddddfffffffffffffffffff ',actual_machine_no)



        console.log('Updating  existing   record  successfully');
        console.log('dataaaaaaaaaaaaaa',actual_machine_no,Line,Esp,machinePulseCount,calculate_in_mtr);
        
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
        FROM [RUNHOURS].[dbo].[atual_master_live]
        WHERE actual_machine_no = @machine_no 
          AND line_no = @line_no 
           ORDER BY sr_no DESC
    )
    UPDATE LatestRecord
    SET live_count = live_count + @machinePulseCount,
        final_live_count = final_live_count + @calculate_in_mtr,
        run_time = run_time + @elapsedTime,
        spool_count = spool_count + @calculate_in_mtr

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
//         FROM [RUNHOURS].[dbo].[atual_master_live]
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
    //   .query(`UPDATE [RUNHOURS].[dbo].[atual_master_live] 
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
      .input('spool_count', sql.Float, calculate_in_mtr)
      
      .input('construction', sql.VarChar, construction)
      .input('run_time', sql.Float, 0) // Adjust as needed
      .input('shift_no', sql.Int, currentShift.shift_no)
      .input('actual_machine_no', sql.Int, actual_machine_no)
      .input('current_shift_target', sql.Float, current_shift_target)
      .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
              (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count) 
              VALUES 
              (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count)`);
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
  
 

// thursday
//   const shiftnoResult = await pool.request()
//       .query(`
//         SELECT COUNT(sr_no) AS sr_no
//         FROM [RUNHOURS].[dbo].[shift_master]
//       `);
// const shifts = shiftnoResult.recordset[0].sr_no;

// console.log('shifts:', shifts);


// console.log("line",Line)

// console.log("machine_no",machineId)
// const target = await pool.request()
//   .input('machine_no', sql.Int, actual_machine_no)
//   .input('line_no', sql.Int, Line)
//   .query(`
//     SELECT 
//       Target_in_mtr
//     FROM [RUNHOURS].[dbo].[master_set_machine_target]
//     WHERE line_no = @line_no AND machine_no = @machine_no
//   `);
//   const total_target = target.recordset[0].Target_in_mtr;



//   const current_shift_target = total_target / shifts
//   console.log("current_shift_target: ",current_shift_target)
  console.log('Shift Start Date Formatted:', shiftStartDateISO);
  console.log('Shift End Date Formatted:', shiftEndDateISO);


  const checklivecountmtr = await pool.request()
  .input('machine_no', sql.VarChar, machineId)
  .input('Esp', sql.VarChar, Esp)
  .input('line_no', sql.VarChar, Line)
  .input('shift_start', sql.DateTime2, spool_date)
 
  .query(`SELECT SUM(spool_count) AS spool_count
          FROM [RUNHOURS].[dbo].[atual_master_live] 
          WHERE machine_no = @machine_no 
         AND esp = @Esp
            AND line_no = @line_no 
            AND actual_date >= @shift_start 
           `);


   


console.log("spool_date",spool_date)
const atual_master_live_count = await pool.request()
  .input('machine_no', sql.VarChar, machineId)
  .input('Esp', sql.VarChar, Esp)
  .input('line_no', sql.VarChar, Line)
  .input('shift_start', sql.DateTime2, spool_date)
 
  .query(`SELECT SUM(live_count) AS live_count
          FROM [RUNHOURS].[dbo].[atual_master_live]
          WHERE machine_no = @machine_no 
         AND esp = @Esp
            AND line_no = @line_no 
            AND actual_date >= @shift_start 
           `);

//  .query( `SELECT SUM(live_count) AS live_count
//  FROM [RUNHOURS].[dbo].[atual_master_live]
//  WHERE machine_no = @machine_no 
//    AND esp = @Esp
//    AND line_no = @line_no 
//   AND shift_start >= @shift_start 
//    AND spool_count > 0`);
            const  atual_master_live_countValue  =  atual_master_live_count.recordset[0]
           console.log("atual_master_live_count:",atual_master_live_countValue)

           console.log("calculate_in_mtr:",calculate_in_mtr)
           console.log("spool:",spool)
 // Ensure calculate_in_mtr is not 0 to avoid division by zero
 if (calculate_in_mtr > 0) {
  let calculatedMasterPulse = spool / calculate_in_mtr;  // Store the calculated value
  console.log("masterPulse:", calculatedMasterPulse);
  masterPulse.push(calculatedMasterPulse); // Push the calculated value into the array
} else {
  console.error("Error: calculate_in_mtr is zero or invalid.");
}

// Similarly, push the `atual_master_live_count` if needed
atual_master_live_count1.push(atual_master_live_countValue); // 


// Ensure masterPulse is compared as a number, not as an array
let masterPulseValue = masterPulse[0]; // Extract the first value from the array if it's always a single value

console.log("live count", atual_master_live_count1[0].live_count);
console.log("calculatedMasterPulse", masterPulseValue);

// Check the condition using the actual masterPulse value
if (atual_master_live_count1[0].live_count >= masterPulseValue) {

  // Log or push a message to indicate target completion
  messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);

  // Reset live_count to 0 in the database for the specific machine and shift
  await pool.request()
    .input('machine_no', sql.Int, machineId)
    .input('line_no', sql.VarChar, Line)
    .input('Esp', sql.Int, Esp)
    .input('shift_start', sql.DateTime2, spool_date) // Ensure spool_date is a DateTime2 value
    .query(`
      UPDATE [RUNHOURS].[dbo].[atual_master_live]
      SET live_count = 0
      WHERE machine_no = @machine_no 
        AND esp = @Esp
        AND line_no = @line_no 
        AND actual_date >= @shift_start -- Adjusted to match exact shift start
    `);

    console.log("updated")
}

const actual = checklivecountmtr.recordset[0];
console.log("spool target final:",spool)
console.log("actual mtr final:",actual.spool_count)
                  if (spool > 0) {
                    
                      const actual = checklivecountmtr.recordset[0];
                      if (actual.spool_count >= spool) {


                          // messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);
                          messages.push(`Target for machine ${machineId} is completed`);
                         
                            await pool.request()
                          .input('machine_no', sql.Int, machineId)
                          .input('line_no', sql.VarChar, Line)
                          .input('Esp', sql.Int, Esp)
                          .input('shift_start', sql.DateTime2, spool_date)
                          .query(`
                            UPDATE [RUNHOURS].[dbo].[atual_master_live]
                            SET spool_count = 0
                            WHERE machine_no = @machine_no 
                              AND esp = @Esp
                              AND line_no = @line_no 
                              AND actual_date  >= @shift_start

                          `);





                         // Create a new request for each query
      const request = pool.request();
console.log("all:",Line,actual_machine_no,construction, spool_date)
      const existingEntry = await request
        .input('line_no', sql.Int, Line)
        .input('machine_no', sql.Int, actual_machine_no)
       
        .input('construction', sql.VarChar, construction)
        .query(`SELECT * FROM [RUNHOURS].[dbo].[construction_spool_data] 
                WHERE line_no = @line_no AND actual_machine_no = @machine_no AND construction = @construction`);

      if (existingEntry.recordset.length > 0) {
        // Update existing entry
        await pool.request()
          .input('line_no', sql.Int, Line)
          .input('machine_no', sql.Int, actual_machine_no)
          .input('construction', sql.VarChar, construction)
          .input('date', sql.DateTime2, spool_date)
          .query(`UPDATE [RUNHOURS].[dbo].[construction_spool_data]
                  SET 
                      spoolly = spoolly + 1
                  WHERE line_no = @line_no AND actual_machine_no = @machine_no AND construction = @construction AND start_time >= @date`);
      } else {
        // Insert new entry
        await pool.request()
        .input('line_no', sql.Int, Line)
        .input('machine_no', sql.Int, actual_machine_no)
        .input('construction', sql.VarChar, construction)
          .query(`INSERT INTO [RUNHOURS].[dbo].[construction_spool_data] 
                  (line_no, actual_machine_no, construction, spoolly) 
                  VALUES (@line_no, @machine_no, @construction, 1)`);
      }

                     


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
          // res.status(200).json({
          //   message: 'Data inserted/updated successfully.',
          //   details: messages,
          //   masterPulse: masterPulse,  // Include masterPulse value
          //   atualMasterLiveCount: atual_master_live_count1 // Include atual_master_live_count
          // });


          for (const machine of machinesDataArray) {
            const machineId = machine.machineId;
            const machinePulseCount = machine.machinePulseCount;
            const Esp = machine.Esp;
            const timestamp = machine.timestamp; // Retrieve the timestamp


            // console.log('dataaaaaaaaaaaaaaaaaaaaa',machineId ,machinePulseCount);
            
//           res.status(200).json({
//   message: 'Data inserted/updated successfully.',
//   details: messages,
//   masterPulse: masterPulse[0],  // Extract the first value from the masterPulse array
//   live_count: atual_master_live_count1[0].live_count,  // Extract the live_count from the object
//   machineId:machineId
// });

const firstMachineData = machinesData[0];

// console.log("Type of actual:", typeof firstMachineData.actual); // Check the type of 'actual'
// console.log("Value of actual:", firstMachineData.actual); // Check the value of 'actual'

// Ensure 'actual' is parsed correctly as an integer
// const actualValue = parseInt(firstMachineData.actual);



  if (parseInt(firstMachineData.actual) >= 0) {
  // If 'actual' is found, do not send this response
  console.log('Skipping response as "actual" is present in machineData');
} else {
  // Send the normal response if 'actual' is not present
  return res.status(200).json({
    message: 'Data inserted/updated successfully.',
    details: messages,
    masterPulse: masterPulse[0],  // Extract the first value from the masterPulse array
    live_count: atual_master_live_count1[0].live_count,  // Extract the live_count from the object
    machineId: machineId
  });
}


          }
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






// for data receive from ESP and perform operation on actual_master_live database table
// app.post('/api/data', async (req, res) => {
//   if (req.method !== 'POST') {
//       return res.status(405).json({ message: 'Only POST requests allowed' });
//   }

//   const machinesData = req.body; // Assuming it's an array of { machineId, machinePulseCount, Esp, Line }

//   console.log("Machine data:", machinesData);

  
//   try {
// const pool = await sql.connect(dbConfig)
   
//       let messages = [];

//       try {
//           let machinesDataArray;
//           if (Array.isArray(machinesData)) {
//             machinesDataArray = machinesData;
//         } else if (Array.isArray(machinesData.data)) {
//             const { data } = machinesData;
//             console.log('Processing:', data);
//             machinesDataArray = data.map(item => ({
//                 Esp: item.Esp,
//                 machineId: item.machineId,
//                 machinePulseCount: item.machinePulseCount,
//                 timestamp: item.timestamp // Ensure the timestamp is correctly mapped
//             }));
//         } else {
//             throw new Error('Invalid machinesData format');
//         }
        

//           for (const machine of machinesDataArray) {
//               const machineId = machine.machineId;
//               const machinePulseCount = machine.machinePulseCount;
//               const Esp = machine.Esp;
//               const timestamp = machine.timestamp; // Retrieve the timestamp


//               console.log('dataaaaaaaaaaaaaaaaaaaaa',machineId ,machinePulseCount);
              
//               // const Line = machine.Line;



              
// // for line
//               const line_check = await pool.request()
//               .input('machine_number', sql.Int, machineId)
//               .input('esp_no', sql.Int, Esp)
//               .query(`SELECT * FROM [RUNHOURS].[dbo].[mater_line_machine_esp] 
//                       WHERE 
//                           machine_number = @machine_number
//                           AND esp_no = @esp_no`);

//                           const Line = line_check.recordset[0].line_number;
//                           if (line_check.recordset.length > 0) {
//                             const Line = line_check.recordset[0].line_number;
//                             console.log('Line number:', Line); 
//                           } else {
//                             console.log('No matching record found in mater_line_machine_esp');
//                           }

//                           const actual_machine_no = line_check.recordset[0].actual_machine_no;

//                           console.log(' actual_machine_no:', actual_machine_no); 

// // for construction
//                           const construction_check = await pool.request()
//                           .input('machine_no', sql.Int, actual_machine_no)
//                           .input('Line', sql.Int, Line)
//                           .query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
//                                   WHERE 
//                                       machine_no = @machine_no AND
//                                       line_no = @Line
//                                        ORDER BY sr_no DESC
//                                       `);
            
//                                       const construction = construction_check.recordset[0].construction;
//                                       if (construction_check.recordset.length > 0) {
//                                         const construction = construction_check.recordset[0].construction;
//                                         console.log('construction type:', construction); 
//                                       } else {
//                                         console.log('No matching record found in mater_line_machine_esp');
//                                       }
            
            
// // for spool
// const spool_check = await pool.request()
// .input('machine_no', sql.Int, actual_machine_no)
// .input('Line', sql.Int, Line)
// .query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
//         WHERE 
//             machine_no = @machine_no AND
//             line_no = @Line
//              ORDER BY sr_no DESC
//             `);

//             const spool_date = spool_check.recordset[0].start_time;
//             const spool = spool_check.recordset[0].spool_target;
//             console.log("spool date:",spool_date )
//             console.log('spool target:', spool); 
//             // if (spool_check.recordset.length > 0) {
//             //   const spool = spool_check.recordset[0].spool_target;
//             //   console.log('spool target:', spool); 
//             // } else {
//             //   console.log('No matching record found in mater_line_machine_esp');
//             // }
            

// // Update machine status to 'online' and record timestamp

// // Capture the current local time
// // Get current date and time in local timezone (IST)
// const now = new Date();
// const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

// // Convert local time to ISO 8601 format (UTC)
// const localTimeISO = localTime.toISOString();

// console.log("Current Local Time in ISO Format (IST):", localTimeISO);

// // Adjust for IST manually by adding 5 hours and 30 minutes
// const istOffset = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5 hours 30 minutes in milliseconds
// const adjustedLocalTime = new Date(localTime.getTime() + istOffset);
// const adjustedLocalTimeISO = adjustedLocalTime.toISOString();

// console.log("Adjusted Local Time in ISO Format (IST):", adjustedLocalTimeISO);
// console.log("line.......:",Line)
// await pool.request()
//     .input('line_number', sql.VarChar, Line)
//     .input('actual_machine_no', sql.Int, actual_machine_no)
//     .input('machine_number', sql.VarChar, machineId)
//     .input('esp_no', sql.VarChar, Esp)
//     .input('status', sql.VarChar, 'online')
//     .input('update_status_time', sql.DateTime2, adjustedLocalTimeISO) // Adjusted IST timestamp
//     .query(`MERGE [RUNHOURS].[dbo].[master_machine_status] AS target
//             USING (SELECT @line_number AS line_number, @machine_number AS machine_number, @esp_no AS esp_no) AS source
//             ON target.line_number = source.line_number AND target.machine_number = source.machine_number AND target.esp_no = source.esp_no
//             WHEN MATCHED THEN
//               UPDATE SET status = @status, update_status_time = @update_status_time
//             WHEN NOT MATCHED THEN
//               INSERT (line_number, machine_number, esp_no, status, update_status_time, actual_machine_no)
//               VALUES (@line_number, @machine_number, @esp_no, @status, @update_status_time, @actual_machine_no);
//     `);
   
             
              

       
// // Get current date and time in local timezone (IST)
// const currentHours = String(now.getHours()).padStart(2, '0');
// const currentMinutes = String(now.getMinutes()).padStart(2, '0');
// const currentSeconds = String(now.getSeconds()).padStart(2, '0');
// const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
// console.log("Current Time:", currentTimeString);

// const currentDateString = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
// console.log("Current Date:", currentDateString);

// const result = await pool.request()
// .query(`SELECT * FROM [RUNHOURS].[dbo].[shift_master]`);
// const shifts = result.recordset;

// let currentShift = null;

// shifts.forEach(shift => {
//   const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
//   const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
//   console.log("Start Time:", startTime);
//   console.log("End Time:", endTime);

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

// if (currentShift) {
//   console.log('Current Shift:', currentShift);

//   // Determine the correct start and end datetimes for the current shift
//   let shiftStartDate = new Date(now);
//   let shiftEndDate = new Date(now);

//   const [startHours, startMinutes, startSeconds] = currentShift.starttime.split(':').map(Number);
//   const [endHours, endMinutes, endSeconds] = currentShift.endtime.split(':').map(Number);

//   shiftStartDate.setHours(startHours, startMinutes, startSeconds);
//   shiftEndDate.setHours(endHours, endMinutes, endSeconds);

//   if (endHours < startHours) {
//     // Shift spans midnight
//     if (now.getHours() < startHours) {
//       shiftStartDate.setDate(shiftStartDate.getDate() - 1);
//     } else {
//       shiftEndDate.setDate(shiftEndDate.getDate() + 1);
//     }
//   }

//   const formatDate = (date) => {
//     const [day, month, year] = [date.getDate(), date.getMonth() + 1, date.getFullYear()];
//     const [hours, minutes, seconds] = [date.getHours(), date.getMinutes(), date.getSeconds()];
//     return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000Z`;
//   };

//   const shiftStartDateISO = formatDate(shiftStartDate);
//   const shiftEndDateISO = formatDate(shiftEndDate);

//   console.log('Shift Start Date Formatted:', shiftStartDateISO);
//   console.log('Shift End Date Formatted:', shiftEndDateISO);

//   console.log("Line",Line)
//   console.log("actual_machine_no",actual_machine_no)
// // Get the calculated_in_mtr value from master_set_machine_target
// const targetResult = await pool.request()
// .input('line_no', sql.Int, Line)
// .input('machine_no', sql.Int, actual_machine_no)
// .query(`SELECT calculate_in_mtr 
//         FROM [RUNHOURS].[dbo].[master_set_machine_target] 
//         WHERE line_no = @line_no 
//           AND machine_no = @machine_no`);

//           console.log('Target Result:', targetResult.recordset);
// if (targetResult.recordset.length === 0) {
// throw new Error('No matching entry found in master_set_machine_target');
// }

// const { calculate_in_mtr } = targetResult.recordset[0];

// console.log('Target Result2:', targetResult.recordset);


// //  target   

// const shiftnoResult = await pool.request()
// .query(`
//   SELECT COUNT(shift_no) AS sr_no
//   FROM [RUNHOURS].[dbo].[shift_master]
// `);
// const shifts = shiftnoResult.recordset[0].sr_no;

// console.log('shifts:', shifts);


// console.log("line",Line)

// console.log("machine_no",machineId)
// const target = await pool.request()
// .input('machine_no', sql.Int, actual_machine_no)
// .input('line_no', sql.Int, Line)
// .query(`
// SELECT 
// Target_in_mtr
// FROM [RUNHOURS].[dbo].[master_set_machine_target]
// WHERE line_no = @line_no AND machine_no = @machine_no
// `);
// const total_target = target.recordset[0].Target_in_mtr;



// const current_shift_target = total_target / shifts
// console.log("current_shift_target: ",current_shift_target)






//   const actualResult = await pool.request()
//     .input('machine_no', sql.Int, actual_machine_no)
//     .input('line_no', sql.VarChar, Line)
//     .input('Esp', sql.Int, Esp)
//     .input('shift_start', sql.DateTime2, shiftStartDateISO)  // SQL Server will handle the ISO format
//     .input('shift_end', sql.DateTime2, shiftEndDateISO)      // SQL Server will handle the ISO format
//     .input('shift_no', sql.Int, currentShift.shift_no)
//     .query(`SELECT * 
//             FROM [RUNHOURS].[dbo].[atual_master_live]
//             WHERE actual_machine_no = @machine_no 
              
//                AND line_no = @line_no 
//               AND shift_start = @shift_start 
//               AND shift_end = @shift_end 
//               AND shift_no = @shift_no`);


//               // const Target_spool  = await pool.request()
//               // .input('machine_no', sql.Int, actual_machine_no)
//               // .input('line_no', sql.VarChar, Line)
//               //  .input('shift_no', sql.Int, currentShift.shift_no)
//               // .query(`SELECT * 
//               //         FROM [RUNHOURS].[dbo].[atual_master_live]
//               //         WHERE actual_machine_no = @machine_no 
                        
//               //            AND line_no = @line_no 
//               //           AND shift_start = @shift_start 
//               //           AND shift_end = @shift_end 
//               //           AND shift_no = @shift_no`);




//   if (actualResult.recordset.length > 0) {  //update & elased time insert



//     const currentTime = new Date();
// console.log('timeeeeeeeeeeee',currentTime);
// const currentHour1 = currentTime.getHours();

// if (!previousPulseCounts[machineId]) {
//   previousPulseCounts[machineId] = {};
// }

// if (!previousPulseCounts[machineId][Esp]) {
//   previousPulseCounts[machineId][Esp] = { pulseCount: machinePulseCount, startTime: currentTime };
// } 


// const previousPulseData = previousPulseCounts[machineId][Esp];

// console.log('previousPulseData',previousPulseData)

// if (machinePulseCount == previousPulseData.pulseCount && machinePulseCount == 1) {   //normal insert ==1

//   if (previousPulseData.startTime) {
//     // Calculate elapsed time since startTime
//     const elapsedTime = (currentTime - previousPulseData.startTime) / 1000; // in seconds
//     console.log(`Elapsed Time: ${elapsedTime} seconds`);




//     // Online  Offline  Logic

//     try {
//       // Check if elapsed time is greater than 25 seconds
//       if (elapsedTime > 25) {


// console.log("Esp: ",Esp)
//         await pool.request()
//         .input('machine_no', sql.VarChar, machineId)
//         .input('line_no', sql.VarChar, Line)
//         .input('Esp', sql.Int, Esp)
//         .input('shift_start', sql.DateTime2, shiftStartDateISO)
//         .input('shift_end', sql.DateTime2, shiftEndDateISO)
//         .input('actual_date', sql.DateTime2, adjustedLocalTimeISO)
//         .input('live_count', sql.Int, machinePulseCount)
//         .input('final_live_count', sql.Float, calculate_in_mtr)
//         .input('spool_count', sql.Float, calculate_in_mtr)
       
//         .input('construction', sql.VarChar, construction)
//         .input('run_time', sql.Float, 0) // Adjust as needed
//         .input('shift_no', sql.Int, currentShift.shift_no)
//         .input('actual_machine_no', sql.Int, actual_machine_no)
//         .input('current_shift_target', sql.Float, current_shift_target)
//         .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
//                 (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count) 
//                 VALUES 
//                 (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count)`);
    
          
// console.log('Inserted  successfully   after  ')
//                 // await pool.request()
//                 // .input('machine_no', sql.VarChar, machineId)
//                 // .input('line_no', sql.VarChar, Line)
//                 // .input('shift_start', sql.DateTime2, shiftStartDateISO)
//                 // .input('shift_end', sql.DateTime2, shiftEndDateISO)
//                 // .input('shift_no', sql.Int, currentShift.shift_no)
//                 // .input('machinePulseCount', sql.Int, machinePulseCount)
//                 // .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
//                 // .query(`
//                 //   ;WITH LatestRecord AS (
//                 //       SELECT TOP 1 * 
//                 //       FROM [RUNHOURS].[dbo].[atual_master_live]
//                 //       WHERE machine_no = @machine_no 
//                 //         AND line_no = @line_no 
//                 //       ORDER BY sr_no DESC
//                 //   )
//                 //   UPDATE LatestRecord
//                 //   SET live_count = live_count + @machinePulseCount,
//                 //       final_live_count = final_live_count + @calculate_in_mtr
//                 // `);
//         // Update status to offline
//         // await sql.query`
//         //   UPDATE [RUNHOURS].[dbo].[OutputTable]
//         //   SET status = 'offline'
//         //   WHERE MachineId = ${machineId} and CONVERT(date, entry_date) = CONVERT(date, ${currentTime})`;
//         // console.log(`Machine ID: ${machineId} is offline`);
//       } else{

// console.log('Elapseddddddddd_time ',elapsedTime)
// console.log('ddddddddddfffffffffffffffffff ',actual_machine_no)



//         console.log('Updating  existing   record  successfully');
//         console.log('dataaaaaaaaaaaaaa',actual_machine_no,Line,Esp,machinePulseCount,calculate_in_mtr);
        
//         await pool.request()
//   .input('machine_no', sql.Int, actual_machine_no)
//   .input('line_no', sql.VarChar, Line)
//   .input('Esp', sql.Int, Esp)
//   .input('shift_start', sql.DateTime2, shiftStartDateISO)
//   .input('shift_end', sql.DateTime2, shiftEndDateISO)
//   .input('shift_no', sql.Int, currentShift.shift_no)
//   .input('machinePulseCount', sql.Int, machinePulseCount)
//   .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
 
//   .input('elapsedTime', sql.Float, elapsedTime)
//   .query(`
//     ;WITH LatestRecord AS (
//         SELECT TOP 1 * 
//         FROM [RUNHOURS].[dbo].[atual_master_live]
//         WHERE actual_machine_no = @machine_no 
//           AND line_no = @line_no 
//            ORDER BY sr_no DESC
//     )
//     UPDATE LatestRecord
//     SET live_count = live_count + @machinePulseCount,
//         final_live_count = final_live_count + @calculate_in_mtr,
//         run_time = run_time + @elapsedTime,
//         spool_count = spool_count + @calculate_in_mtr

//   `);
//       }
//     } catch (error) {
//       console.error(`Error Inserting  updated  construction for Machine ID: ${machineId}`, error);
//     }

    
    
//   }else{

//   }

//   // Set startTime to current time for the new idle period
//   previousPulseData.startTime = currentTime;



// }   //normal insert ==1 

// else {
//   // No change needed if pulse count has not increased

//   console.log('No  previous  count  ');
// // await pool.request()
// //   .input('machine_no', sql.VarChar, machineId)
// //   .input('line_no', sql.VarChar, Line)
// //   .input('shift_start', sql.DateTime2, shiftStartDateISO)
// //   .input('shift_end', sql.DateTime2, shiftEndDateISO)
// //   .input('shift_no', sql.Int, currentShift.shift_no)
// //   .input('machinePulseCount', sql.Int, machinePulseCount)
// //   .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
// //   .query(`
// //     ;WITH LatestRecord AS (
// //         SELECT TOP 1 * 
// //         FROM [RUNHOURS].[dbo].[atual_master_live]
// //         WHERE machine_no = @machine_no 
// //           AND line_no = @line_no 
// //         ORDER BY sr_no DESC
// //     )
// //     UPDATE LatestRecord
// //     SET live_count = live_count + @machinePulseCount,
// //         final_live_count = final_live_count + @calculate_in_mtr
// //   `);

//   // console.log(`No pulse count increase for Machine ID: ${machineId}. No idle time update.`);
// }

// // Update the stored pulse count for the machine
// previousPulseData.pulseCount = machinePulseCount;




  
//     // console.log('Updating existing record');
//     // await pool.request()
//     //   .input('machine_no', sql.VarChar, machineId)
//     //   .input('line_no', sql.VarChar, Line)
//     //   .input('shift_start', sql.DateTime2, shiftStartDateISO)
//     //   .input('shift_end', sql.DateTime2, shiftEndDateISO)
//     //   .input('shift_no', sql.Int, currentShift.shift_no)
//     //   .input('machinePulseCount', sql.Int, machinePulseCount)
//     //   .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
//     //   .query(`UPDATE [RUNHOURS].[dbo].[atual_master_live] 
//     //           SET live_count = live_count + @machinePulseCount,
//     //             final_live_count = final_live_count + @calculate_in_mtr
//     //           WHERE machine_no = @machine_no 
//     //             AND line_no = @line_no 
//     //             AND shift_start = @shift_start 
//     //             AND shift_end = @shift_end 
//     //             AND shift_no = @shift_no`);
//   }    //update & elased time insert


//    else {    //normal insert



//     const currentTime = new Date();
//     console.log('timeeeeeeeeeeee',currentTime);
//     const currentHour1 = currentTime.getHours();

//     console.log('espppppppppppppppppppppppppppppppppp',Esp,machineId);
    
//     if (!previousPulseCounts[machineId]) {
//       previousPulseCounts[machineId] = {};
//     }

//     if (!previousPulseCounts[machineId][Esp]) {
//       previousPulseCounts[machineId][Esp] = { pulseCount: machinePulseCount, startTime: currentTime };
//     } 

 

//     console.log('Inserting new record');
//     await pool.request()
//       .input('machine_no', sql.VarChar, machineId)
//       .input('line_no', sql.VarChar, Line)
//       .input('Esp', sql.Int, Esp)
//       .input('shift_start', sql.DateTime2, shiftStartDateISO)
//       .input('shift_end', sql.DateTime2, shiftEndDateISO)
//       .input('actual_date', sql.DateTime2, adjustedLocalTimeISO)
//       .input('live_count', sql.Int, machinePulseCount)
//       .input('final_live_count', sql.Float, calculate_in_mtr)
//       .input('spool_count', sql.Float, calculate_in_mtr)
      
//       .input('construction', sql.VarChar, construction)
//       .input('run_time', sql.Float, 0) // Adjust as needed
//       .input('shift_no', sql.Int, currentShift.shift_no)
//       .input('actual_machine_no', sql.Int, actual_machine_no)
//       .input('current_shift_target', sql.Float, current_shift_target)
//       .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
//               (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count) 
//               VALUES 
//               (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count)`);
//   }   //normal insert



//   // shifts.forEach(shift => {
//   //   const startTime = shift.starttime; // Assuming shift.starttime is in "HH:MM:SS" format
//   //   const endTime = shift.endtime; // Assuming shift.endtime is in "HH:MM:SS" format
//   //   console.log("Start shift Time:", startTime);
//   //   console.log("End shift Time:", endTime);
  
//   //   if (endTime < startTime) { // Shift spans midnight
//   //     if (currentTimeString >= startTime || currentTimeString <= endTime) {
//   //       currentShift = shift;
//   //     }
//   //   } else { // Regular shift
//   //     if (currentTimeString >= startTime && currentTimeString <= endTime) {
//   //       currentShift = shift;
//   //     }
//   //   }
//   // });
  
 

// // thursday
// //   const shiftnoResult = await pool.request()
// //       .query(`
// //         SELECT COUNT(sr_no) AS sr_no
// //         FROM [RUNHOURS].[dbo].[shift_master]
// //       `);
// // const shifts = shiftnoResult.recordset[0].sr_no;

// // console.log('shifts:', shifts);


// // console.log("line",Line)

// // console.log("machine_no",machineId)
// // const target = await pool.request()
// //   .input('machine_no', sql.Int, actual_machine_no)
// //   .input('line_no', sql.Int, Line)
// //   .query(`
// //     SELECT 
// //       Target_in_mtr
// //     FROM [RUNHOURS].[dbo].[master_set_machine_target]
// //     WHERE line_no = @line_no AND machine_no = @machine_no
// //   `);
// //   const total_target = target.recordset[0].Target_in_mtr;



// //   const current_shift_target = total_target / shifts
// //   console.log("current_shift_target: ",current_shift_target)
//   console.log('Shift Start Date Formatted:', shiftStartDateISO);
//   console.log('Shift End Date Formatted:', shiftEndDateISO);


//   const checklivecountmtr = await pool.request()
//   .input('machine_no', sql.VarChar, machineId)
//   .input('Esp', sql.VarChar, Esp)
//   .input('line_no', sql.VarChar, Line)
//   .input('shift_start', sql.DateTime2, spool_date)
 
//   .query(`SELECT SUM(spool_count) AS spool_count
//           FROM [RUNHOURS].[dbo].[atual_master_live] 
//           WHERE machine_no = @machine_no 
//          AND esp = @Esp
//             AND line_no = @line_no 
//             AND actual_date >= @shift_start 
//            `);

//            const actual = checklivecountmtr.recordset[0];
//            const actual1= actual.spool_count[0]

//                       console.log('dataaaaaaaaaaaaaaaaaaaa',spool,actual1);
                                
//                   if (spool > 0) {
//                       const actual = checklivecountmtr.recordset[0];

//                       if (actual.spool_count >= spool) {


//                           // messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);
//                           messages.push(`Target for machine ${machineId} is completed`);

//                             await pool.request()
//                           .input('machine_no', sql.Int, machineId)
//                           .input('line_no', sql.VarChar, Line)
//                           .input('Esp', sql.Int, Esp)
//                           .input('shift_start', sql.DateTime2, spool_date)
//                           .query(`
//                             UPDATE [RUNHOURS].[dbo].[atual_master_live]
//                             SET spool_count = 0
//                             WHERE machine_no = @machine_no 
//                               AND esp = @Esp
//                               AND line_no = @line_no 
//                               AND actual_date >= @shift_start

//                           `);


//                          // Create a new request for each query
//       const request = pool.request();
// console.log("all:",Line,actual_machine_no,construction, spool_date)
//       const existingEntry = await request
//         .input('line_no', sql.Int, Line)
//         .input('machine_no', sql.Int, actual_machine_no)
       
//         .input('construction', sql.VarChar, construction)
//         .query(`SELECT * FROM [RUNHOURS].[dbo].[construction_spool_data] 
//                 WHERE line_no = @line_no AND actual_machine_no = @machine_no AND construction = @construction`);

//       if (existingEntry.recordset.length > 0) {
//         // Update existing entry
//         await pool.request()
//           .input('line_no', sql.Int, Line)
//           .input('machine_no', sql.Int, actual_machine_no)
//           .input('construction', sql.VarChar, construction)
//           .input('date', sql.DateTime2, spool_date)
//           .query(`UPDATE [RUNHOURS].[dbo].[construction_spool_data]
//                   SET 
//                       spoolly = spoolly + 1
//                   WHERE line_no = @line_no AND actual_machine_no = @machine_no AND construction = @construction AND start_time >= @date`);
//       } else {
//         // Insert new entry
//         await pool.request()
//         .input('line_no', sql.Int, Line)
//         .input('machine_no', sql.Int, actual_machine_no)
//         .input('construction', sql.VarChar, construction)
//           .query(`INSERT INTO [RUNHOURS].[dbo].[construction_spool_data] 
//                   (line_no, actual_machine_no, construction, spoolly) 
//                   VALUES (@line_no, @machine_no, @construction, 1)`);
//       }

                     


//                         //   const messages = [
//                         //     `Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`
//                         // ];
//                         // await sendNotification(messages);
                        
                        
                        
//               }
//           }
     
     
     
     
//         } else {
//                   console.log(`No matching plan found for Machine ID: ${machineId} and Line: ${Line}`);
//                   // await pool.rollback();
//                   return res.status(400).json({ message: 'No matching plan found.' });
//               }
//           }

//           // await pool.commit();
//           res.status(200).json({ message: 'Data inserted/updated successfully.', details: messages });
//       } catch (err) {
//           // await pool.rollback();
//           console.error('Error during pool:', err);
//           res.status(500).json({ message: 'Internal Server Error' });
//       }
//   } catch (err) {
//       console.error('Error connecting to database:', err);
//       res.status(500).json({ message: 'Internal Server Error' });
//   } finally {
//       // sql.close();
//   }
// });
    

// backup of update construction
// app.post('/api/updateConstruction', async (req, res) => {
//   const { line_no, machine_no, construction, start_time, end_time } = req.body;
//   console.log("data received:", line_no, machine_no, construction, start_time, end_time)

//   if (!line_no || !machine_no || !construction || !start_time || !end_time) {
//     return res.status(400).send('Missing required fields');
//   }

//   try {

//     await sql.connect(dbConfig);

//     const request = new sql.Request();

//     const query = `
//       UPDATE [RUNHOURS].[dbo].[atual_master_live]
//       SET construction = @construction
//       WHERE actual_machine_no = @machine_no AND
//       line_no = @line_no AND
//       actual_date BETWEEN @start_time AND @end_time
//        ;
//     `;

//     request.input('line_no', sql.Int, line_no);
//     request.input('machine_no', sql.Int, machine_no);
//     request.input('construction', sql.NVarChar, construction);
//     request.input('start_time', sql.DateTime2, start_time);
//     request.input('end_time', sql.DateTime2, end_time);

//     const result = await request.query(query);
//     console.log("update result:", result)


//      // Insert the received data into the master_update_production table
//      const insertQuery = `
//      INSERT INTO [RUNHOURS].[dbo].[master_update_production] 
//      (line_no, machine_no, construction, start_time, end_time)
//      VALUES (@line_no, @machine_no, @construction, @start_time, @end_time);
//    `;

//    const insertResult = await request.query(insertQuery);
//    console.log("Insert result:", insertResult);


//     res.status(200).send('Update successful');
//   } catch (err) {
//     console.error('Error executing query: ', err);
//     res.status(500).send('Internal Server Error');
//   }
// });

app.post('/api/updateConstruction', async (req, res) => {
  console.log('Request body:', req.body); // Log the entire request body for debugging

  const entries = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).send('Entries should be a non-empty array');
  }

  try {
    const pool = await sql.connect(dbConfig); // Establish the database connection once

    for (const entry of entries) {
      const { line_no, machine_no, construction, start_time, end_time } = entry;
      console.log("Data received:", line_no, machine_no, construction, start_time, end_time); // Log each entry for debugging

      if (!line_no || !machine_no || !construction || !start_time || !end_time) {
        throw new Error('Missing required fields');
      }

      const request = pool.request(); // Use the connection pool to create a new request for each entry

      // Update the `atual_master_live` table
      const updateQuery = `
        UPDATE [RUNHOURS].[dbo].[atual_master_live]
        SET construction = @construction
        WHERE actual_machine_no = @machine_no AND
        line_no = @line_no AND
        actual_date BETWEEN @start_time AND @end_time;
      `;

      await request.input('line_no', sql.Int, line_no);
      await request.input('machine_no', sql.Int, machine_no);
      await request.input('construction', sql.NVarChar, construction);
      await request.input('start_time', sql.DateTime2, start_time);
      await request.input('end_time', sql.DateTime2, end_time);
      await request.query(updateQuery);

      // Insert the received data into the `master_update_production` table
      const insertQuery = `
        INSERT INTO [RUNHOURS].[dbo].[master_update_production] 
        (line_no, machine_no, construction, start_time, end_time)
        VALUES (@line_no, @machine_no, @construction, @start_time, @end_time);
      `;

      await request.query(insertQuery);
    }

    res.status(200).send('Update and insert successful');
  } catch (err) {
    console.error('Error during operation:', err);
    res.status(500).send('Operation failed');
  }
});











// // Conversion factor: 1 inch = 0.0254 meters
// const INCH_TO_METER = 0.0254;
// const PI = Math.PI;

// Conversion factors
const MM_TO_INCH = 1 / 25.4; // 1 mm = 0.0393701 inches
const INCH_TO_METER = 0.0254; // 1 inch = 0.0254 meters
const PI = Math.PI;

// Calculate meters per pulse from pulley diameter
app.post('/api/calculate_target_mtr', async (req, res) => {
  const entries = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).send('Entries should be a non-empty array');
  }

  try {
    const pool = await sql.connect(dbConfig); 

    for (const entry of entries) {
      const { line_no, machine_no, pulley_diameter, entry_date, target_in_mtr, rpm } = entry;

      if (!line_no || !machine_no || !pulley_diameter || !entry_date || !target_in_mtr || !rpm) {
        throw new Error('Missing required fields');
      }


 // Convert pulley diameter from mm to inches
      const pulley_diameter_inches = pulley_diameter * MM_TO_INCH;

      // Calculate circumference in inches
      const circumference_in_inches = PI * pulley_diameter_inches;

      // Convert circumference to meters
      const calculate_in_mtr = circumference_in_inches * INCH_TO_METER;

      
      // Calculate circumference in inches
      // const circumference_in_inches = PI * pulley_diameter;

      // Convert circumference to meters
      // const calculate_in_mtr = circumference_in_inches * INCH_TO_METER;

      // Create a new request for each query
      const request = pool.request();

      const existingEntry = await request
        .input('line_no', sql.Int, line_no)
        .input('machine_no', sql.Int, machine_no)
        .input('entry_date', sql.Date, entry_date)
        .query(`SELECT * FROM [RUNHOURS].[dbo].[master_set_machine_target] 
                WHERE line_no = @line_no AND machine_no = @machine_no`);

      if (existingEntry.recordset.length > 0) {
        // Update existing entry
        await pool.request()
          .input('line_no', sql.Int, line_no)
          .input('machine_no', sql.Int, machine_no)
          .input('pulley_diameter', sql.Float, pulley_diameter)
          .input('entry_date', sql.Date, entry_date)
          .input('target_in_mtr', sql.Float, target_in_mtr)
          .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
          .input('rpm', sql.Int, rpm)
          .query(`UPDATE [RUNHOURS].[dbo].[master_set_machine_target]
                  SET pulley_diameter = @pulley_diameter, 
                      target_in_mtr = @target_in_mtr, 
                      calculate_in_mtr = @calculate_in_mtr, 
                      rpm = @rpm
                  WHERE line_no = @line_no AND machine_no = @machine_no`);
      } else {
        // Insert new entry
        await pool.request()
          .input('line_no', sql.Int, line_no)
          .input('machine_no', sql.Int, machine_no)
          .input('pulley_diameter', sql.Float, pulley_diameter)
          .input('entry_date', sql.Date, entry_date)
          .input('target_in_mtr', sql.Float, target_in_mtr)
          .input('calculate_in_mtr', sql.Float, calculate_in_mtr)
          .input('rpm', sql.Int, rpm)
          .query(`INSERT INTO [RUNHOURS].[dbo].[master_set_machine_target] 
                  (line_no, machine_no, pulley_diameter, entry_date, target_in_mtr, calculate_in_mtr, rpm) 
                  VALUES (@line_no, @machine_no, @pulley_diameter, @entry_date, @target_in_mtr, @calculate_in_mtr, @rpm)`);
      }
    }

    res.status(200).send('Data inserted successfully');
  } catch (err) {
    console.error('SQL connection error:', err);
    res.status(500).send('SQL connection error');
  }
});







// using array  
app.post('/api/construction_length_counters', async (req, res) => {
  const entries = req.body;

  console.log('Received request body:', req.body);

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: 'Request body should be a non-empty array' });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const results = [];

    for (const entry of entries) {
      const { construction, actualDate } = entry;

      if (!construction || !actualDate) {
        return res.status(400).json({ message: 'Missing required fields in one of the entries' });
      }

      // Query to get meter per kg
      const query1 = `
        SELECT meter_per_kg 
        FROM [RUNHOURS].[dbo].[master_construction_details]
        WHERE construction_name = @construction 
      `;
      const request1 = pool.request()
        .input('construction', sql.VarChar, construction);
      
      const result1 = await request1.query(query1);
      
      if (result1.recordset.length === 0) {
        results.push({ construction, actualDate, error: 'Construction details not found' });
        continue; // Skip to the next entry
      }

      const mtr_kg = result1.recordset[0].meter_per_kg;

      console.log("mtr_kg:", mtr_kg);

      // Query to get total live count
      const query = `
        SELECT SUM(final_live_count) AS totalLiveCount
        FROM [RUNHOURS].[dbo].[atual_master_live]
        WHERE construction = @construction AND CONVERT(date, actual_date) = @actualDate
      `;
      const request = pool.request()
        .input('construction', sql.VarChar, construction)
        .input('actualDate', sql.Date, actualDate);
      
      const result = await request.query(query);

      if (result.recordset.length === 0 || result.recordset[0].totalLiveCount === null) {
        results.push({ construction, actualDate, error: 'No data found for the given criteria' });
        continue; // Skip to the next entry
      }

      const mtr = result.recordset[0].totalLiveCount;
      console.log("mtr:", mtr);

      // Ensure mtr_kg and mtr are valid numbers before dividing
      if (mtr === 0) {
        results.push({ construction, actualDate, error: 'Total live count is zero, cannot perform division' });
        continue; // Skip to the next entry
      }

      const kg = mtr_kg / mtr;
      console.log("kg:", kg);

      // Format mtr and kg
      const mtrFormatted = mtr.toFixed(2);
      const kgFormatted = kg.toFixed(2);

      results.push({ 
        construction, 
        actualDate, 
        mtr: parseFloat(mtrFormatted), 
        kg: parseFloat(kgFormatted) 
      });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'No valid data found' });
    }

    res.status(200).json({ 
      message: 'Data retrieved successfully for constructions', 
      results 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // await sql.close();
  }
});










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
        .query(`SELECT * FROM [RUNHOURS].[dbo].[shift_master]`);
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
            FROM [RUNHOURS].[dbo].[atual_master_live]
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
// app.post('/api/run_hrs_One_line_shift', async (req, res) => {
//   const { dataArray } = req.body; // Expecting an array of objects with 'date' and 'Line'

//   // console.log('Received request body:', req.body);

//   try {
//     // Connect to the database
//     const pool = await sql.connect(dbConfig);

//     const results = [];

//     // Iterate through each item in the dataArray
//     for (const { date, Line } of dataArray) {
//       // console.log(`Processing Line: ${Line} for Date: ${date}`);

//       // Capture the current local time
//       const now = new Date();
//       const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
//       const currentHours = String(now.getHours()).padStart(2, '0');
//       const currentMinutes = String(now.getMinutes()).padStart(2, '0');
//       const currentSeconds = String(now.getSeconds()).padStart(2, '0');
//       const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;
//       // console.log("Current Time:", currentTimeString);

//       const result = await pool.request().query(`SELECT * FROM [RUNHOURS].[dbo].[shift_master]`);
//       const shifts = result.recordset;

//       let currentShift = null;

//       shifts.forEach(shift => {
//         const startTime = shift.starttime;
//         const endTime = shift.endtime;

//         if (endTime < startTime) { // Shift spans midnight
//           if (currentTimeString >= startTime || currentTimeString <= endTime) {
//             currentShift = shift;
//           }
//         } else { // Regular shift
//           if (currentTimeString >= startTime && currentTimeString <= endTime) {
//             currentShift = shift;
//           }
//         }
//       });

//       if (currentShift) {
//         // Use the provided date from the request body
//         let shiftStartDate = new Date(date);
//         let shiftEndDate = new Date(date);

//         const [startHours, startMinutes, startSeconds] = currentShift.starttime.split(':').map(Number);
//         const [endHours, endMinutes, endSeconds] = currentShift.endtime.split(':').map(Number);

//         shiftStartDate.setHours(startHours, startMinutes, startSeconds);
//         shiftEndDate.setHours(endHours, endMinutes, endSeconds);

//         if (endHours < startHours) { // If the shift spans midnight
//           if (now.getHours() < startHours) {
//             shiftStartDate.setDate(shiftStartDate.getDate() - 1);
//           } else {
//             shiftEndDate.setDate(shiftEndDate.getDate() + 1);
//           }
//         }

//         const formatDate = (date) => {
//           const [day, month, year] = [date.getDate(), date.getMonth() + 1, date.getFullYear()];
//           const [hours, minutes, seconds] = [date.getHours(), date.getMinutes(), date.getSeconds()];
//           return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.000Z`;
//         };

//         const shiftStartDateISO = formatDate(shiftStartDate);
//         const shiftEndDateISO = formatDate(shiftEndDate);

//         console.log('Shift Start Date Formatted:', shiftStartDateISO);
//         console.log('Shift End Date Formatted:', shiftEndDateISO);

//         let liveCountData = await pool.request()
//           .input('date1', sql.DateTime, shiftStartDateISO)
//           .input('date2', sql.DateTime, shiftEndDateISO)
//           .input('Line', sql.Int, Line)
//           .query(`
//   WITH LatestEntries AS (
//     SELECT 
//       actual_machine_no,
//       final_live_count,
//       construction,
//       target,
//       actual_date,
//       ROW_NUMBER() OVER (
//         PARTITION BY actual_machine_no 
//         ORDER BY actual_date DESC
//       ) AS rn
//     FROM 
//       [RUNHOURS].[dbo].[atual_master_live]
//     WHERE 
//       line_no = @Line AND 
//       shift_start >= @date1 
//       AND shift_end <= @date2
//   ),
//   TotalCounts AS (
//     SELECT
//       actual_machine_no,
//       SUM(final_live_count) AS totalLiveCount,
//       SUM(run_time) AS totalrun_time
//     FROM
//       [RUNHOURS].[dbo].[atual_master_live]
//     WHERE
//       line_no = @Line AND 
//       shift_start >= @date1 
//       AND shift_end <= @date2
//     GROUP BY
//       actual_machine_no
//   )
//   SELECT
//     tc.actual_machine_no,
//     tc.totalrun_time,
//     tc.totalLiveCount,
//     le.construction AS latest_construction,
//     le.target,
//     sp.spool_target
//   FROM
//     TotalCounts tc
//   JOIN
//     LatestEntries le
//   ON 
//     tc.actual_machine_no = le.actual_machine_no
//   JOIN
//     [RUNHOURS].[dbo].[master_set_production] sp
//   ON 
//     tc.actual_machine_no = sp.machine_no
//   WHERE 
//     le.rn = 1;
// `);

//         if (liveCountData.recordset.length > 0) {
//           const totalrun_time = liveCountData.recordset.map(record => {
//             const runTimeInSeconds = record.totalrun_time;
//             const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
//               ? Math.floor(runTimeInSeconds / 60)
//               : 0;
//             const runTimeInHours = runTimeInMinutes / 60;

//             return {
//               ...record,
//               run_time_minutes: runTimeInMinutes,
//               run_time_hours: runTimeInHours.toFixed(2)
//             };
//           });

         
//           results.push({
//             line: Line,
//             date,
//             totalrun_time,
           
//           });
//         } else {
//           results.push({
//             line: Line,
//             date,
//             message: 'No live count data found for the given date range and line.'
//           });
//         }
//       }
//     }
    



//     res.status(200).json({
//       message: 'RUN HRS. | Line-Machine (Line Machine Wise Shift Wise)',
//       data: results
//     });
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// });


app.post('/api/run_hrs_One_line_shift', async (req, res) => {
  const { dataArray } = req.body; // Expecting an array of objects with 'date' and 'Line'

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);
    const results = [];

    // Iterate through each item in the dataArray
    for (const { date, Line } of dataArray) {
      // Capture the current local time
      const now = new Date();
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentSeconds = String(now.getSeconds()).padStart(2, '0');
      const currentTimeString = `${currentHours}:${currentMinutes}:${currentSeconds}`;

      const result = await pool.request().query(`SELECT * FROM [RUNHOURS].[dbo].[shift_master]`);
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

        // Query 1: Get the latest entries
        const latestEntriesData = await pool.request()
          .input('date1', sql.DateTime, shiftStartDateISO)
          .input('date2', sql.DateTime, shiftEndDateISO)
          .input('Line', sql.Int, Line)
          .query(`
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
              [RUNHOURS].[dbo].[atual_master_live]
            WHERE 
              line_no = @Line AND 
              shift_start >= @date1 
              AND shift_end <= @date2
          `);

        // Query 2: Get the total counts
        const totalCountsData = await pool.request()
          .input('date1', sql.DateTime, shiftStartDateISO)
          .input('date2', sql.DateTime, shiftEndDateISO)
          .input('Line', sql.Int, Line)
          .query(`
            SELECT
              actual_machine_no,
              SUM(final_live_count) AS totalLiveCount,
              SUM(run_time) AS totalrun_time
            FROM
              [RUNHOURS].[dbo].[atual_master_live]
            WHERE
              line_no = @Line AND 
              shift_start >= @date1 
              AND shift_end <= @date2
            GROUP BY
              actual_machine_no
          `);

        // Query 3: Get the spool target
        const spoolTargetData = await pool.request()
          .input('Line', sql.Int, Line)
          .query(`
            SELECT  
              machine_no,
              spool_target
            FROM
              [RUNHOURS].[dbo].[master_set_production]
          `);

        // Combining results manually
        if (latestEntriesData.recordset.length > 0 && totalCountsData.recordset.length > 0 && spoolTargetData.recordset.length > 0) {
          const combinedData = totalCountsData.recordset.map(totalRecord => {
            const latestRecord = latestEntriesData.recordset.find(l => l.actual_machine_no === totalRecord.actual_machine_no);
            const spoolRecord = spoolTargetData.recordset.find(s => s.machine_no == totalRecord.actual_machine_no);

console.log('Total Record:', totalRecord);
    console.log('Spool Record:', spoolRecord);


            const runTimeInSeconds = totalRecord.totalrun_time;
            const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
              ? Math.floor(runTimeInSeconds / 60)
              : 0;
            const runTimeInHours = runTimeInMinutes / 60;

            return {
              actual_machine_no: totalRecord.actual_machine_no,
              totalrun_time: totalRecord.totalrun_time,
              totalLiveCount: totalRecord.totalLiveCount,
              latest_construction: latestRecord ? latestRecord.construction : null,
              target: latestRecord ? latestRecord.target : null,
              spool_target: spoolRecord ? spoolRecord.spool_target : null,
              run_time_minutes: runTimeInMinutes,
              run_time_hours: runTimeInHours.toFixed(2)
            };
          });

          results.push({
            line: Line,
            date,
            combinedData,
          });
        } else {
          results.push({
            line: Line,
            date,
            message: 'No data found for the given date range and line.'
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


// construction on machine / Line / Whole Day
app.post('/api/line_machine_construction_wholeday', async (req, res) => {
  const { line, machine, actualDates } = req.body; // Expecting line, machine, and a single date string

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Array to store results
    let results = [];

    // Process the single date
    const actualDate = actualDates;
    console.log(`Processing date: ${actualDate} for line: ${line} and machine: ${machine}`);

    // Fetch construction data for the specific date, line, and machine
    const constructionn = await pool.request()
      .input('line', sql.Int, line)
      .input('machine', sql.Int, machine)
      .input('actualDate', sql.DateTime, actualDate)
      .query(`
        SELECT line_no, construction
        FROM [RUNHOURS].[dbo].[atual_master_live]
        WHERE CONVERT(Date, shift_start) = @actualDate
          AND line_no = @line
          AND actual_machine_no = @machine
        GROUP BY line_no, construction
      `);

    console.log("Construction for lines for the whole day: ", constructionn.recordset);

    // Prepare a list of constructions for the query
    const constructions = constructionn.recordset.map(row => `'${row.construction}'`).join(',');

    // Fetch meter_per_kg for the various constructions
    const query = `
      SELECT construction_name, meter_per_kg
      FROM [RUNHOURS].[dbo].[master_construction_details]
      WHERE construction_name IN (${constructions})
    `;

    const meterPerKgResults = await pool.request().query(query);
    console.log("Meter per kg for various constructions: ", meterPerKgResults.recordset);

    // Fetch the live count data based on the provided date, line, and machine
    const liveCountData = await pool.request()
      .input('line', sql.Int, line)
      .input('machine', sql.Int, machine)
      .input('actualDate', sql.DateTime, actualDate)
      .query(`
        SELECT line_no, SUM(run_time) AS totalrun_time, SUM(final_live_count) as final_live_mtr, construction
        FROM [RUNHOURS].[dbo].[atual_master_live]
        WHERE CONVERT(Date, shift_start) = @actualDate
          AND line_no = @line
          AND actual_machine_no = @machine
        GROUP BY line_no, construction
      `);

    console.log("Live Count Data: ", liveCountData.recordset);

    // Convert final_live_mtr (meters) into kilograms
    const conversionResults = liveCountData.recordset.map(record => {
      const meterPerKg = meterPerKgResults.recordset.find(mpk => mpk.construction_name === record.construction)?.meter_per_kg;

      let final_live_kg = 0;
      if (meterPerKg) {
        final_live_kg = record.final_live_mtr ? record.final_live_mtr / meterPerKg : 0; // Convert meters to kg
      } else {
        console.warn(`Meter per kg not found for construction: ${record.construction}`);
      }

      return {
        line_no: record.line_no,
        machine: machine,
        final_live_mtr: record.final_live_mtr,
        construction: record.construction,
        final_live_kg: final_live_kg
      };
    });

    // Store the result if data is found
    if (conversionResults.length > 0) {
      results.push({
        actualDate,
        conversionResults
      });
    } else {
      results.push({
        actualDate,
        conversionResults: []
      });
    }

    console.log("Final Results:", results);

    // Send the response with the calculated data
    res.status(200).json({
      message: 'RUN HRS. | All plants (line-wise) for the entire day across multiple dates',
      results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    // sql.close();
  }
});




// run hrs all line by  whole day wise

app.post('/api/run_hrs_all_plant_wholeDay', async (req, res) => {
  const { actualDates } = req.body; // Expecting an array of actualDates

  console.log('Received request body:', req.body);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    // Array to store results for each date
    let results = [];

    // Iterate over the array of dates
    for (const actualDate of actualDates) {
      console.log(`Processing date: ${actualDate}`);

      // Fetch construction data for the specific date
      const constructionn = await pool.request()
        .input('actualDate', sql.DateTime, actualDate)
        .query(`
          SELECT line_no, construction
          FROM [RUNHOURS].[dbo].[atual_master_live]
          WHERE CONVERT(Date, shift_start) = @actualDate
          GROUP BY line_no, construction
        `);

      console.log("Construction for lines for whole day: ", constructionn.recordset);

      // Prepare a list of constructions for the query
      const constructions = constructionn.recordset.map(row => `'${row.construction}'`).join(',');

      // Fetch meter_per_kg for the various constructions
      const query = `
        SELECT construction_name, meter_per_kg
        FROM [RUNHOURS].[dbo].[master_construction_details]
        WHERE construction_name IN (${constructions})
      `;

      const meterPerKgResults = await pool.request().query(query);
      console.log("Meter per kg for various constructions: ", meterPerKgResults.recordset);

      // Fetch the live count data based on the provided date
      const liveCountData = await pool.request()
        .input('actualDate', sql.DateTime, actualDate)
        .query(`
          SELECT line_no, SUM(run_time) AS run_time, SUM(final_live_count) AS final_live_mtr, construction
          FROM [RUNHOURS].[dbo].[atual_master_live]
          WHERE CONVERT(Date, shift_start) = @actualDate 
          GROUP BY line_no, construction
        `);

      console.log("Live Count Data: ", liveCountData.recordset);

      // Object to store total final_live_kg and final_live_mtr for each line_no
      let lineWiseTotals = {};

      // Convert final_live_mtr (meters) into kilograms and calculate run times
      const conversionResults = liveCountData.recordset.map(record => {
        const meterPerKg = meterPerKgResults.recordset.find(mpk => mpk.construction_name === record.construction)?.meter_per_kg;

        let final_live_kg = 0;
        if (meterPerKg) {
          final_live_kg = record.final_live_mtr ? record.final_live_mtr / meterPerKg : 0; // Convert meters to kg
          
          // Accumulate the total kg and meters for the specific line_no
          if (lineWiseTotals[record.line_no]) {
            lineWiseTotals[record.line_no].totalFinalLiveKg += final_live_kg;
            lineWiseTotals[record.line_no].totalFinalLiveMtr += record.final_live_mtr;
          } else {
            lineWiseTotals[record.line_no] = {
              totalFinalLiveKg: final_live_kg,
              totalFinalLiveMtr: record.final_live_mtr
            };
          }
        } else {
          console.warn(`Meter per kg not found for construction: ${record.construction}`);
        }

        const runTimeInSeconds = record.run_time;
        const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
          ? Math.floor(runTimeInSeconds / 60)
          : 0;
        const runTimeInHours = (runTimeInMinutes / 60).toFixed(2);

        return {
          ...record,
          run_time_minutes: runTimeInMinutes,
          run_time_hours: runTimeInHours,
          final_live_kg: final_live_kg,
          run_time: record.run_time // 
        };
      });

      // If data is found, store the results
      if (conversionResults.length > 0) {
        results.push({
          actualDate,
          conversionResults,
          lineWiseTotals
        });
      } else {
        results.push({
          actualDate,
          message: 'No live count data found for this date.',
          lineWiseTotals: {}
        });
      }
    }

    console.log("Final Results:", results);

    // Send the response with the calculated run hours and total kg for each line across all dates
    res.status(200).json({
      message: 'RUN HRS. | All plants (line-wise) for the entire day across multiple dates',
      results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close the database connection
    // sql.close();
  }
});


     
// run hrs all line by whole day wise  || target || latest construction || actual live count mtr wise (length counters)



// app.post('/api/run_hrs_Line_machine_wholeDay', async (req, res) => {
//   const { dataArray } = req.body; // Expecting an array of objects with 'date' and 'Line'

//   console.log('Received request body:', req.body);

//   try {
//     // Connect to the database
//     const pool = await sql.connect(dbConfig);

//     const results = [];

//     // Iterate through each item in the dataArray
//     for (const { actualDate, Line } of dataArray) {
//       console.log(`Processing Line: ${Line} for Date: ${actualDate}`);

    


//         let liveCountData = await pool.request()
//         .input('actualDate', sql.DateTime, actualDate)
//          .input('Line', sql.Int, Line)
//           .query(`
//             WITH LatestEntries AS (
//               SELECT 
//                 actual_machine_no,
//                 final_live_count,
//                 construction,
//                 target,
//                 actual_date,
//                 ROW_NUMBER() OVER (
//                   PARTITION BY actual_machine_no 
//                   ORDER BY actual_date DESC
//                 ) AS rn
//               FROM 
//                 [RUNHOURS].[dbo].[atual_master_live]
//               WHERE 
//                 line_no = @Line AND 
//                  CONVERT(Date, shift_start) = @actualDate
//             ),
//             TotalCounts AS (
//               SELECT
//                 actual_machine_no,
//                 SUM(final_live_count) AS totalLiveCount,
//                 SUM(run_time) AS totalrun_time
//               FROM
//                 [RUNHOURS].[dbo].[atual_master_live]
//               WHERE
//                 line_no = @Line AND 
//                 CONVERT(Date, shift_start) = @actualDate
//               GROUP BY
//                 actual_machine_no
//             ),
                

// Target AS (
//   SELECT
//     actual_machine_no,
//     SUM(Target_in_mtr) AS totalTarget
//   FROM
//     [RUNHOURS].[dbo].[master_set_machine_target]
//   WHERE
//     line_no = @Line AND 
//     CONVERT(Date, entry_date) = @actualDate
//   GROUP BY
//     actual_machine_no
// )
//            SELECT
//               tc.actual_machine_no,
//               tc.totalrun_time,
//               tc.totalLiveCount,
//               le.construction AS latest_construction,
//               le.target
//             FROM
//               TotalCounts tc
//             JOIN
//               LatestEntries le
//             ON tc.actual_machine_no = le.actual_machine_no
//             WHERE le.rn = 1;
//           `);

//         if (liveCountData.recordset.length > 0) {
//           const totalrun_time = liveCountData.recordset.map(record => {
//             const runTimeInSeconds = record.totalrun_time;
//             const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
//               ? Math.floor(runTimeInSeconds / 60)
//               : 0;
//             const runTimeInHours = runTimeInMinutes / 60;

//             return {
//               ...record,
//               run_time_minutes: runTimeInMinutes,
//               run_time_hours: runTimeInHours.toFixed(2)
//             };
//           });

        

//           results.push({
//             line: Line,
//             actualDate,
//             totalrun_time,
           
//           });
//         } else {
//           results.push({
//             line: Line,
//             actualDate,
//             message: 'No live count data found for the given date range and line.'
//           });
//         }
//       }
    

//     res.status(200).json({
//       message: 'RUN HRS. | Line machine (line-machine wise) for the entire day',
//       data: results
//     });
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// });


app.post('/api/run_hrs_Line_machine_wholeDay', async (req, res) => {
  const { dataArray } = req.body; // Expecting an array of objects with 'actualDate' and 'Line'

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
              actual_date,
              ROW_NUMBER() OVER (
                PARTITION BY actual_machine_no 
                ORDER BY actual_date DESC
              ) AS rn
            FROM 
              [RUNHOURS].[dbo].[atual_master_live]
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
              [RUNHOURS].[dbo].[atual_master_live]
            WHERE
              line_no = @Line AND 
              CONVERT(Date, shift_start) = @actualDate
            GROUP BY
              actual_machine_no
          ),
          Target AS (
            SELECT
              machine_no AS actual_machine_no,
              SUM(Target_in_mtr) AS totalTarget
            FROM
              [RUNHOURS].[dbo].[master_set_machine_target]
            WHERE
              line_no = @Line  
            GROUP BY
              machine_no
          )
          SELECT
            tc.actual_machine_no,
            tc.totalrun_time,
            tc.totalLiveCount,
            le.construction AS latest_construction,
            t.totalTarget AS target
          FROM
            TotalCounts tc
          JOIN
            LatestEntries le ON tc.actual_machine_no = le.actual_machine_no
          LEFT JOIN
            Target t ON tc.actual_machine_no = t.actual_machine_no
          WHERE le.rn = 1;
        `);

      // if (liveCountData.recordset.length > 0) {
      //   const processedData = liveCountData.recordset.map(record => {
      //     const runTimeInSeconds = record.totalrun_time;
      //     const runTimeInMinutes = typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)
      //       ? Math.floor(runTimeInSeconds / 60)
      //       : 0;
      //     const runTimeInHours = runTimeInMinutes / 60;

      //     return {
      //       ...record,
      //       run_time_minutes: runTimeInMinutes,
      //       run_time_hours: runTimeInHours.toFixed(2)
      //     };
      //   });

      if (liveCountData.recordset.length > 0) {
    const processedData = liveCountData.recordset.map(record => {
        const runTimeInSeconds = record.totalrun_time;

        // Initialize hours, minutes, and seconds
        let hours = 0;
        let minutes = 0;
        let seconds = 0;

        // Check if runTimeInSeconds is a valid number
        if (typeof runTimeInSeconds === 'number' && !isNaN(runTimeInSeconds)) {
            // Calculate hours, minutes, and seconds
            hours = Math.floor(runTimeInSeconds / 3600);
            minutes = Math.floor((runTimeInSeconds % 3600) / 60);
            seconds = Math.floor(runTimeInSeconds % 60);
        }

        // Format as "HR:MIN:SEC"
        const formattedRunTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        return {
            ...record,
            run_time_hours: formattedRunTime // Add the formatted time to the record
        };
    });

        results.push({
          line: Line,
          actualDate,
          data: processedData
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







let machineDataa = [];
app.post('/api/processMachineData', async (req, res) => {
  const machineDataa = req.body; // This will capture the JSON data sent from Postman

  // Log the received data
  console.log('Data received:', machineDataa);

  try {
    let machinesDataArray;
    let processedMachineIds = []; // Array to store processed machineIds

    // Check if the incoming data is an array or a single object
    if (Array.isArray(machineDataa)) {
      machinesDataArray = machineDataa; // Handle array of data
    } else if (machineDataa.Esp && machineDataa.machineId && machineDataa.status) {
      // If it's a single object, wrap it into an array
      machinesDataArray = [machineDataa];
    } else {
      throw new Error('Invalid machinesData format');
    }

    const pool = await sql.connect(dbConfig);

    for (let data of machinesDataArray) {
      const machineId = data.machineId;
      const Esp = data.Esp;
      const status = data.status;

      console.log("Data received for processing:", machineId, Esp, status);


      
      // Check for machine and ESP combination in the mater_line_machine_esp table
      const line_check = await pool.request()
        .input('machine_number', sql.Int, machineId)
        .input('esp_no', sql.Int, Esp)
        .query(`SELECT * FROM [RUNHOURS].[dbo].[mater_line_machine_esp] 
                WHERE 
                    machine_number = @machine_number
                    AND esp_no = @esp_no`);

      if (line_check.recordset.length > 0) {
        const Line = line_check.recordset[0].line_number;
        console.log('Line number:', Line); 
      } else {
        console.log('No matching record found in mater_line_machine_esp');
        continue; // Skip to the next data item in the loop if no match is found
      }

      const actual_machine_no = line_check.recordset[0].actual_machine_no;
      console.log('Actual machine number:', actual_machine_no); 

      // Fetch construction from master_set_production table
      const construction_check = await pool.request()
        .input('machine_no', sql.Int, actual_machine_no)
        .input('Line', sql.Int, line_check.recordset[0].line_number)
        .query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
                WHERE 
                    machine_no = @machine_no 
                    AND line_no = @Line
                ORDER BY sr_no DESC`);

      if (construction_check.recordset.length > 0) {
        const construction = construction_check.recordset[0].construction;
        console.log('Construction type:', construction); 
      } else {
        console.log('No matching record found in master_set_production');
        continue; // Skip to the next data item if no match is found
      }

      // Fetch spool date and target from master_set_production
      const spoolCheck = await pool.request()
        .input('machine_no', sql.Int, machineId)
        .input('Line', sql.Int, line_check.recordset[0].line_number)
        .query(`SELECT TOP 1 * FROM [RUNHOURS].[dbo].[master_set_production] 
                WHERE machine_no = @machine_no AND line_no = @Line 
                ORDER BY sr_no DESC`);

      if (spoolCheck.recordset.length === 0) {
        console.log(`No spool data found for machine: ${machineId}`);
        continue; // Skip to the next iteration
      }

      const spoolDate = spoolCheck.recordset[0].start_time;
      const spoolTarget = spoolCheck.recordset[0].spool_target;

      console.log("Spool date:", spoolDate);
      console.log("Spool target:", spoolTarget);

      // Calculate the sum of spool count from atual_master_live
      const liveCountResult = await pool.request()
        .input('machine_no', sql.Int, machineId)
        .input('Esp', sql.Int, Esp)
        .input('line_no', sql.VarChar, line_check.recordset[0].line_number)
        .input('shift_start', sql.DateTime2, spoolDate)
        .query(`SELECT SUM(spool_count) AS spool_count
                FROM [RUNHOURS].[dbo].[atual_master_live] 
                WHERE machine_no = @machine_no 
                  AND esp = @Esp
                  AND line_no = @line_no 
                  AND actual_date >= @shift_start`);

      const spoolCount = liveCountResult.recordset[0].spool_count;
      const actualDate = liveCountResult.recordset[0]?.actual_date;

      console.log(`Spool Count: ${spoolCount}, Actual Date: ${actualDate}`);

      // Insert the spool_count and actual_date into spool_summary table
      await pool.request()
        .input('machine_no', sql.Int, actual_machine_no)
        .input('line_no', sql.Int, line_check.recordset[0].line_number)
        .input('Esp', sql.Int, Esp)
        .input('shift_start', sql.DateTime2, spoolDate)
        .input('construction', sql.VarChar, construction_check.recordset[0].construction)
        .input('spool_count', sql.Float, spoolCount)
        .input('actual_date', sql.Date, actualDate)
        .query(`INSERT INTO [RUNHOURS].[dbo].[spool_summary] 
                (machine_no, line_no, Esp, shift_start, spool_count, construction) 
                VALUES (@machine_no, @line_no, @Esp, @shift_start, @spool_count, @construction)`);

      console.log(`Data inserted for machine ${machineId}`);
var lineeee = line_check.recordset[0].line_number;
      console.log("actual_machine_no:",actual_machine_no,lineeee, Esp,spoolDate,);
      // Reset the spool_count in atual_master_live table
      await pool.request()
        .input('machine_no', sql.Int, machineId)
        .input('line_no', sql.VarChar, line_check.recordset[0].line_number)
        .input('Esp', sql.Int, Esp)
        .input('shift_start', sql.DateTime2, spoolDate)
        .query(`UPDATE [RUNHOURS].[dbo].[atual_master_live]  
                SET spool_count = 0
                WHERE machine_no = @machine_no 
                  AND esp = @Esp
                  AND line_no = @line_no 
                  AND actual_date >= @shift_start`);

      console.log(`Spool count reset for machine ${machineId}`);


 // Now select to check if the update was successful
  const result = await pool.request()
    .input('machine_no', sql.Int, actual_machine_no)
    .input('Esp', sql.Int, Esp)
    .input('shift_start', sql.DateTime2, spoolDate)
    .input('line_no', sql.VarChar, line_check.recordset[0].line_number)
    .query(`SELECT spool_count 
            FROM [RUNHOURS].[dbo].[atual_master_live]
            WHERE machine_no = @machine_no 
              AND esp = @Esp
              AND line_no = @line_no 
              AND shift_start >= @shift_start`);

  // Check if the spool_count is updated to 0
  if (result.recordset.length > 0) {
    const updatedCount = result.recordset[0].spool_count;
    if (updatedCount === 0) {
      console.log('Update successful: spool_count is now 0.');
    } else {
      console.log(`Update failed: spool_count is still ${updatedCount}.`);
    }
  } else {
    console.log('No records found after update.');
  }
      
      // Add the processed machineId to the array
      processedMachineIds.push(machineId);
    }

    res.status(200).json({ message: 'Highduration', processedMachineIds });
  } catch (err) {
    console.error('Error processing machine data:', err);
    res.status(500).json({ message: 'Error processing data', error: err.message });
  }
});


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
      FROM [RUNHOURS].[dbo].[shift_master]
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
    const availability1 = variable2 / variable1;
    const availability = availability1 * 100;;

    const results = [];

    for (const data of dataArray) {
      const { date1, date2 } = data;

      // Calculate Performance
      const targetData = await pool.request().query(`
        SELECT SUM(Target_in_mtr) AS totalTarget
        FROM [RUNHOURS].[dbo].[master_set_machine_target]
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
          FROM [RUNHOURS].[dbo].[atual_master_live]
          WHERE CONVERT(date, shift_start) >= @date1 
          AND CONVERT(date, shift_end) <= @date2
        `);

      if (liveCountData.recordset.length === 0) {
        res.status(404).json({ message: 'No live count data found for the given date range and line.' });
        return;
      }

      const variable4 = liveCountData.recordset[0].totalLiveCount;
      console.log("variable4:", variable4);
      const performance1 = variable4 / variable3;
      const performance = performance1 * 100;

      // Calculate Quality
      const variable5 = 0.9 * variable4;
      console.log("variable5:", variable5);
      const quality1 = variable5 / variable4;
      const quality = quality1 * 100;
      // Calculate OEE as a percentage
      const oee = (availability1 * performance1 * quality1) * 100;

      console.log('Availability:', availability1);
      console.log('Performance:', performance1);
      console.log('Quality:', quality1);
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
    // sql.close();
  }
});








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
      FROM [RUNHOURS].[dbo].[shift_master]
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
    const availability1 = variable2 / variable1;
    const availability = availability1 * 100;
    const results = [];

    for (const data of dataArray) {
      const { date1, date2, Line } = data;

      // Calculate Performance
      const targetData = await pool.request()
        .input('Line', sql.Int, Line)
        .query(`
          SELECT SUM(Target_in_mtr) AS totalTarget
          FROM [RUNHOURS].[dbo].[master_set_machine_target]
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
          FROM [RUNHOURS].[dbo].[atual_master_live]
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
      const performance1 = variable4 / variable3;
      const performance = performance1 * 100;
      // Calculate Quality
      const variable5 = 0.9 * variable4;
      console.log("variable5:", variable5);
      const quality1 = variable5 / variable4;
      const quality = quality1 * 100;
      // Calculate OEE as a percentage
      const oee = (availability1 * performance1 * quality1) * 100;

      console.log('Availability:', availability1);
      console.log('Performance:', performance1);
      console.log('Quality:', quality1);
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
    // sql.close();
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
// app.post('/api/calculateOEELine_machine', verifyToken, async (req, res) => {
//   const { date1, date2, Line, machine } = req.body;
  
//   console.log('Received request body:', req.body);
  
//   try {
//     // Connect to the database
//     const pool = await sql.connect(dbConfig);

//     // Convert 24 hours into minutes and store it in variable1
//     const variable1 = 24 * 60;

//     // Select tea_time and lunch_time from shift_master table and subtract it from variable1
//     const shiftData = await pool.request()
//       .query(`
//         SELECT SUM(tea_time) AS tea_time, SUM(lunch_time) AS lunch_time
//         FROM [RUNHOURS].[dbo].[shift_master]
//       `);

//     console.log("variable1:", variable1);
//     if (shiftData.recordset.length === 0) {
//       res.status(404).json({ message: 'No shift data found.' });
//       return;
//     }

//     const { tea_time, lunch_time } = shiftData.recordset[0];
//     console.log("tea_time + lunch_time:", tea_time, lunch_time);
//     const variable2 = variable1 - (tea_time + lunch_time);
//     console.log("variable2:", variable2);

//     // Calculate Availability
//     const availability = variable2 / variable1;

//     // Calculate Performance
//     const targetData = await pool.request()
//     .input('Line', sql.Int, Line)
//     .input('machine', sql.Int, machine)
//       .query(`
//         SELECT SUM(Target_in_mtr) AS totalTarget
//         FROM [RUNHOURS].[dbo].[master_set_machine_target]
//         where line_no = @Line and machine_no = @machine
//       `);

//     if (targetData.recordset.length === 0) {
//       res.status(404).json({ message: 'No target data found for the given line.' });
//       return;
//     }

//     const variable3 = targetData.recordset[0].totalTarget;
//     console.log("variable3:", variable3);

//     // Select live count data based on the shift start and end times
//     const liveCountData = await pool.request()
//       .input('Line', sql.Int, Line)
//       .input('date1', sql.DateTime, date1)
//       .input('date2', sql.DateTime, date2)
//       .input('machine', sql.Int, machine)
//       .query(`
//         SELECT SUM(final_live_count) AS totalLiveCount
//         FROM [RUNHOURS].[dbo].[atual_master_live]
//         WHERE  CONVERT(date, shift_start) >= @date1 
//         AND CONVERT(date, shift_end) <= @date2
//         and line_no = @Line 
//         and actual_machine_no = @machine
//       `);

//     if (liveCountData.recordset.length === 0) {
//       res.status(404).json({ message: 'No live count data found for the given date range and line.' });
//       return;
//     }

//     const variable4 = liveCountData.recordset[0].totalLiveCount;
//     console.log("variable4:", variable4);
//     const performance = variable4 / variable3;

//     // Calculate Quality
//     const variable5 = 0.9 * variable4;
//     console.log("variable5:", variable5);
//     const quality = variable5 / variable4;

//     // Calculate OEE as a percentage
//     const oee = (availability * performance * quality) * 100;

//     console.log('Availability:', availability);
//     console.log('Performance:', performance);
//     console.log('Quality:', quality);
//     console.log('OEE:', oee);

//     res.status(200).json({ 
//       message: 'OEE calculations completed successfully. | Machine Wise',
//       availability,
//       performance,
//       quality,
//       oee
//     });
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   } finally {
//     // Close database connection
//     // await sql.close();
//   }
// });



// Using Array


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
        FROM [RUNHOURS].[dbo].[shift_master]
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
      const availability1 = variable2 / variable1;
      const availability = availability1 * 100;

      // Calculate Performance
      const targetData = await pool.request()
        .input('Line', sql.Int, Line)
        .input('machine', sql.Int, machine)
        .query(`
          SELECT SUM(Target_in_mtr) AS totalTarget
          FROM [RUNHOURS].[dbo].[master_set_machine_target]
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
          FROM [RUNHOURS].[dbo].[atual_master_live]
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
      const performance1 = variable4 / variable3;
      const performance = performance1 * 100;

      // Calculate Quality
      const variable5 = 0.9 * variable4;
      console.log("variable5:", variable5);
      const quality1 = variable5 / variable4;
      const quality = quality1 * 100;

      // Calculate OEE as a percentage
      const oee = (availability1 * performance1 * quality1) * 100;

      console.log('Availability:', availability1);
      console.log('Performance:', performance1);
      console.log('Quality:', quality1);
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



app.post('/api/wholeday_masterspool_target', async (req, res) => {
  const dataArray = req.body;

  console.log('Received request body:', dataArray);

  try {
    // Connect to the database
    const pool = await sql.connect(dbConfig);

    const results = [];

    for (const data of dataArray) {
      const { line, actualdate } = data;


        // ISNULL(SUM(AML.spool_count), 0) AS totalLiveCount
      // Combined query without construction-wise grouping
      const combinedData = await pool.request()
        .input('line', sql.Int, line)
        .input('actualdate', sql.Date, actualdate)
        .query(`
          WITH RankedEntries AS (
            SELECT 
                line_no,
                machine_no,
                spool_target,
                 start_time,
                ROW_NUMBER() OVER (PARTITION BY machine_no ORDER BY start_time DESC) AS rn
            FROM 
                [RUNHOURS].[dbo].[master_set_production]
            WHERE 
                line_no = @line
          )
          SELECT 
              RE.line_no,
              RE.machine_no,
              RE.spool_target,
              ISNULL(SUM(
        CASE 
            WHEN  AML.actual_date >= RE.start_time THEN AML.spool_count 
            ELSE 0 
        END
    ), 0) AS totalLiveCount
          FROM 
              RankedEntries RE
          LEFT JOIN 
              [RUNHOURS].[dbo].[atual_master_live] AML
          ON 
              RE.machine_no = AML.actual_machine_no 
              AND RE.line_no = AML.line_no 
              AND CONVERT(Date, AML.shift_start) = @actualdate
          WHERE 
              RE.rn = 1
          GROUP BY 
              RE.line_no,
              RE.machine_no,
              RE.spool_target
        `);

      if (combinedData.recordset.length === 0) {
        res.status(404).json({ message: 'No data found for the specified line and date.' });
        return;
      }

      results.push({
        line,
        actualdate,
        data: combinedData.recordset
      });
    }

    res.status(200).json({
      message: 'Latest machine data with spool count retrieved successfully.',
      data: results
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  } finally {
    // Close database connection
    // sql.close();
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://IP:${port}`);
});



