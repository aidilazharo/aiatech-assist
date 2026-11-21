'use strict';
const rules=require('../.memory/versioning.json');
const REGEX=/^(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)$/;
function parts(x){if(typeof x!=='string'||!REGEX.test(x))throw Error('Version must be canonical MAJOR.MINOR.PATCH, each 0..99.');const a=x.split('.').map(Number);if(a.some(n=>n>99))throw Error('Version exceeds 99.99.99.');return a;}
function nextVersion(x){const [a,b,c]=parts(x);if(rules.schema!==1||rules.initialVersion!=='0.0.0'||rules.maxVersion!=='99.99.99'||rules.strategy!=='single-step-base-100-carry')throw Error('Invalid versioning policy memory.');if(a===99&&b===99&&c===99)throw Error('Maximum version 99.99.99 reached.');return c<99?[a,b,c+1].join('.'):b<99?[a,b+1,0].join('.'):[a+1,0,0].join('.');}
function requireIncrement(prev,next){const expected=nextVersion(prev);if(next!==expected)throw Error('Version must increment exactly once: '+prev+' -> '+expected+'.');return next;}
module.exports={parts,nextVersion,requireIncrement};
