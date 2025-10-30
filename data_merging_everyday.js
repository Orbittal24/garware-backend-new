const http = require('http');         // 🧠 Import HTTP module
const sql = require('mssql');
const cron = require('node-cron');

// 🧠 Configure your DB
const config = {
  user: 'nsa',
  password: 'namashivay',
  server: '192.168.10.10',
  database: 'RUNHOURS',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

let lastRunInfo = null;  // 🧠 Keep track of last run status

async function optimizeActualMasterLive(dateStr) {
  let pool;
  try {
    pool = await sql.connect(config);

    const startTime = `${dateStr} 07:00:00`;
    const nextDay = new Date(dateStr);
    nextDay.setDate(nextDay.getDate() + 1);
    const endTime = `${nextDay.toISOString().slice(0, 10)} 07:00:00`;

    console.log(`🕰 Processing data between ${startTime} and ${endTime}...`);

    let resBefore = await pool.request()
      .input('startTime', sql.DateTime, new Date(startTime))
      .input('endTime', sql.DateTime, new Date(endTime))
      .query(`SELECT COUNT(*) AS CountBefore FROM [RUNHOURS].[dbo].[atual_master_live]
              WHERE actual_date >= @startTime AND actual_date < @endTime;`);
    const countBefore = resBefore.recordset[0].CountBefore;
    console.log(`➡️ Raw record count before merge: ${countBefore}`);

    const mergeQuery = `
      BEGIN TRANSACTION;

      SELECT * INTO #daily_data
      FROM [RUNHOURS].[dbo].[atual_master_live]
      WHERE actual_date >= @startTime AND actual_date < @endTime;

      WITH merged AS (
          SELECT 
                line_no, actual_machine_no, shift_no, construction, esp, target,
                MIN(shift_start)      AS shift_start,
                MAX(shift_end)        AS shift_end,
                MIN(actual_date)      AS actual_date,
                MAX(spool_date)       AS spool_date,
                SUM(live_count)       AS live_count,
                SUM(final_live_count) AS final_live_count,
                SUM(spool_count)      AS spool_count,
                SUM(run_time)         AS run_time
          FROM #daily_data
          GROUP BY line_no, actual_machine_no, shift_no, construction, esp, target
      )
      INSERT INTO [RUNHOURS].[dbo].[atual_master_live]
      (
          line_no, actual_machine_no, shift_no, construction, esp, target,
          shift_start, shift_end, actual_date, spool_date,
          live_count, final_live_count, spool_count, run_time
      )
      SELECT
          line_no, actual_machine_no, shift_no, construction, esp, target,
          shift_start, shift_end, actual_date, spool_date,
          live_count, final_live_count, spool_count, run_time
      FROM merged;

      DECLARE @mergedCount INT = @@ROWCOUNT;

      DELETE aml
      FROM [RUNHOURS].[dbo].[atual_master_live] aml
      JOIN #daily_data d
      ON aml.sr_no = d.sr_no;

      DECLARE @deletedCount INT = @@ROWCOUNT;

      COMMIT TRANSACTION;

      SELECT @mergedCount AS mergedCount, @deletedCount AS deletedCount;
    `;

    const result = await pool.request()
      .input('startTime', sql.DateTime, new Date(startTime))
      .input('endTime', sql.DateTime, new Date(endTime))
      .query(mergeQuery);

    const { mergedCount, deletedCount } = result.recordset[0];
    console.log(`✅ Merged into ${mergedCount} summary record(s).`);
    console.log(`✅ Deleted ${deletedCount} raw record(s).`);

    let resAfter = await pool.request()
      .input('startTime', sql.DateTime, new Date(startTime))
      .input('endTime', sql.DateTime, new Date(endTime))
      .query(`SELECT COUNT(*) AS CountAfter FROM [RUNHOURS].[dbo].[atual_master_live]
              WHERE actual_date >= @startTime AND actual_date < @endTime;`);
    const countAfter = resAfter.recordset[0].CountAfter;
    console.log(`➡️ Raw record count after merge: ${countAfter}`);

    lastRunInfo = { dateStr, countBefore, mergedCount, deletedCount, countAfter };
  } catch (error) {
    lastRunInfo = { error: error.message };
    console.error('❌ Error during optimization:', error);
    try {
      await pool?.request().query('ROLLBACK TRANSACTION;');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }
  } finally {
    if (pool) await pool.close();
  }
}

// 🧠 Run every day at 07:00
cron.schedule('0 7 * * *', async () => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1); 
  const dateStr = yesterday.toISOString().slice(0, 10); 
  console.log(`🕰 Starting optimization for ${dateStr} at ${now.toISOString()}...`);
  await optimizeActualMasterLive(dateStr);  
  console.log(`✅ Optimization for ${dateStr} completed.`);
});

// // 🧠 Test: Run this manually for quick check
// optimizeActualMasterLive('2024-10-29');

// 🧠 HTTP server on port 7575
const PORT = 7575;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'running',
    lastRunInfo
  }));
}).listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
