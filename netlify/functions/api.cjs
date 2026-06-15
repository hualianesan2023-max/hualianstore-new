const serverless = require('serverless-http');
const app = require('../../api/index.cjs'); // นำเข้า Express App เดิมมาใช้งาน

module.exports.handler = serverless(app);
