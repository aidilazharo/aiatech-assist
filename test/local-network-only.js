'use strict';
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
function local(host) { return !host || ['localhost','localhost.localdomain','127.0.0.1','::1','[::1]'].includes(String(host).toLowerCase()); }
function allowed(host) {
 if (!local(host)) throw new Error('Offline verification rejected an external request.');
}
const fetchLocal = global.fetch;
global.fetch = (request, options) => {
 try {
  const url=new URL(typeof request==='string'||request instanceof URL?request:request.url);
  allowed(url.hostname);
  return fetchLocal(request,options);
 } catch(error) { return Promise.reject(error); }
};
for (const transport of [http,https]) {
 for (const name of ['request','get']) {
  const original=transport[name];
  transport[name] = function (input,...rest) {
   const options = typeof input==='string'||input instanceof URL?new URL(input):input;
   allowed(options?.hostname||options?.host);
   return original.call(this,input,...rest);
  };
 }
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) {
 const options=Array.isArray(args[0])?args[0][0]:args[0];
 allowed(typeof options==='object'?options?.host:typeof options==='number'?args[1]:'');
 return connect.apply(this,args);
};
