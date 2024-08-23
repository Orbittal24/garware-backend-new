


const express = require('express');
var sql = require('mssql');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const { format } = require('date-fns');
const app = express();
const port = 9002; // Choose any available port

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




app.post('/api/updateConstruction', async (req, res) => {
  console.log('Request body:', req.body); // Log the entire request body for debugging

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
        const { line_no, machine_no, construction, start_time, end_time } = entry;
        console.log("data received:", line_no, machine_no, construction, start_time, end_time); // Log each entry for debugging

        if (!line_no || !machine_no || !construction || !start_time || !end_time) {
          throw new Error('Missing required fields');
        }

        const request = new sql.Request(transaction);

        // Update the `atual_master_live` table
        const updateQuery = `
          UPDATE [Garware].[dbo].[atual_master_live]
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
          INSERT INTO [Garware].[dbo].[master_update_production] 
          (line_no, machine_no, construction, start_time, end_time)
          VALUES (@line_no, @machine_no, @construction, @start_time, @end_time);
        `;

        await request.query(insertQuery);
      }

      await transaction.commit();
      res.status(200).send('Update and insert successful');
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
          FROM [Garware].[dbo].[master_construction_details]
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
          FROM [Garware].[dbo].[atual_master_live]
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
      await sql.close();
    }
  });
  



// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

