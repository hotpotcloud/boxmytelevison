'use strict';

// Load the password as data, never as shell or dotenv syntax.
const fs = require('node:fs');
const path = require('node:path');
const { password } = JSON.parse(fs.readFileSync(path.join(__dirname, 'password.json'), 'utf8'));
if (typeof password !== 'string' || password.length === 0) {
  throw new Error('Deployment password is empty');
}
process.env.PASSWORD = password;
process.env.NODE_ENV = 'production';
process.env.HOSTNAME = '0.0.0.0';
process.env.PORT = '8080';
require('./server.js');
