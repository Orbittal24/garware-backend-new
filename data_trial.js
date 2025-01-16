const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const { format } = require('date-fns');
const { log } = require('console');
const app = express();
const port = 3003; // Choose any available port

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
            line_no = @Line AND
             start_time <= GETDATE()
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
  console.log("actual_machine_no.......",actual_machine_no)
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
      if (elapsedTime > 15) {


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
      
            .input('current_shift_target', sql.Float, spool)
        .input('spool_date', sql.DateTime2, spool_date)
        .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
                (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count, spool_date) 
                VALUES 
                (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count, @spool_date)`);
    
          
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
     
       .input('current_shift_target', sql.Float, spool)
        .input('spool_date', sql.DateTime2, spool_date)
      .query(`INSERT INTO [RUNHOURS].[dbo].[atual_master_live] 
              (machine_no, line_no, shift_start, shift_end, actual_date, live_count, final_live_count, construction, run_time, shift_no, esp, actual_machine_no,target, spool_count,spool_date) 
              VALUES 
              (@machine_no, @line_no, @shift_start, @shift_end, @actual_date, @live_count, @final_live_count, @construction, @run_time, @shift_no, @Esp, @actual_machine_no,@current_shift_target, @spool_count, @spool_date)`);
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

console.log("live count", atual_master_live_count1[0].live_count,"actual_machine_no============",actual_machine_no);
console.log("calculatedMasterPulse", masterPulseValue);

// Check the condition using the actual masterPulse value
if (atual_master_live_count1[0].live_count >= masterPulseValue) {

  // Log or push a message to indicate target completion
  // messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);

  // Reset live_count to 0 in the database for the specific machine and shift
  // await pool.request()
  //   .input('machine_no', sql.Int, machineId)
  //   .input('line_no', sql.VarChar, Line)
  //   .input('Esp', sql.Int, Esp)
  //   .input('shift_start', sql.DateTime2, spool_date) // Ensure spool_date is a DateTime2 value
  //   .query(`
  //     UPDATE [RUNHOURS].[dbo].[atual_master_live]
  //     SET live_count = 0
  //     WHERE machine_no = @machine_no 
  //       AND esp = @Esp
  //       AND line_no = @line_no 
  //       AND actual_date >= @shift_start -- Adjusted to match exact shift start
  //   `);

  //   console.log("updated")
}

const actual = checklivecountmtr.recordset[0];
console.log("spool target final:",spool)
console.log("actual mtr final:",actual.spool_count,"actual_machine_no:::::::::::::::",actual_machine_no)
                  if (spool > 0) {
                    
                      const actual = checklivecountmtr.recordset[0];
                      if (actual.spool_count >= spool) {


                          // messages.push(`Target for machine ${machineId} is completed in shift ${currentShift.shift_no}, Line: ${Line}, ESP: ${Esp}.`);
                          messages.push(`Target for machine ${machineId} is completed`);
                         
                          //   await pool.request()
                          // .input('machine_no', sql.Int, machineId)
                          // .input('line_no', sql.VarChar, Line)
                          // .input('Esp', sql.Int, Esp)
                          // .input('shift_start', sql.DateTime2, spool_date)
                          // .query(`
                          //   UPDATE [RUNHOURS].[dbo].[atual_master_live]
                          //   SET spool_count = 0
                          //   WHERE machine_no = @machine_no 
                          //     AND esp = @Esp
                          //     AND line_no = @line_no 
                          //     AND actual_date  >= @shift_start

                          // `);





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


console.log("firstMachineData",firstMachineData)
            console.log(" machinesData[0]", machinesData[0])
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





// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://IP:${port}`);
});



