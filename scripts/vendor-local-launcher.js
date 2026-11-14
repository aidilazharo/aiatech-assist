'use strict';
const path=require('node:path');
const {python}=require('./python-runtime');
const result=python([path.join(__dirname,'vendor-local.py'),...process.argv.slice(2)],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exitCode=result.status||1;
