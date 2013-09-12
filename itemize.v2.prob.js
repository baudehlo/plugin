var fs = require('fs');
var tmp = require('tmp');
var request= require('request');
var http = require('http');
var async = require('async');
var config = require("ini");

var config = config.parse(fs.readFileSync('./config/itemize.ini', 'utf-8'));
var counter = 0;

exports.hook_rcpt = function (next, connection) {
    if (connection.transaction.rcpt_to.length > 1) {
        return next(DENYSOFT, "We only accept mail one recipient at a time");
    }
    var toaddr = connection.transaction.rcpt_to[0].address().toLowerCase();
    var to = toaddr; //toaddr.split('@')[0];	
    return next();
//    VerifyUserId( connection, next, to);
}

exports.hook_data = function (next, connection) {
    connection.loginfo("<<<<<<<<<<<<<<<<<<<<<hook data");
    connection.transaction.parse_body = 1;
    connection.transaction.attachment_hooks( function (ct, fn, body, stream) {
    	    connection.loginfo("------ attachment cb");
    	    tmp.file(function (err, path, fd) {
        	connection.loginfo("Got tempfile: " + path + " (" + fd + ")");
            	start_att(connection, ct, fn, body, stream, path, fd)
	   });
    });
    next();
}

function start_att (connection, ct, fn, body, stream, path, fd) {
    connection.loginfo("<<<<<<<<<<<<<<<<<<<<<Getting attachment");
    connection.loginfo("Got attachment: " + ct + ", " + fn + " for user id: " + "user");
    counter++;
    stream.connection = connection; // Allow backpressure
    stream.pause();

        var ws = fs.createWriteStream(path);
        stream.pipe(ws);
        stream.resume();
        connection.loginfo("after create write stream");
		
        stream.on('end', function ( ) {
//        ws.on('close', function ( ) {
//        ws.on('end', function ( ) {
            connection.loginfo("End of stream reached");
            fs.fstat(fd, function (err, stats) {
                connection.loginfo("Got data of length: " + stats.size);
    		counter--;
            });
        });
}


exports.hook_queue = function (next, connection) {
	connection.loginfo("<<<<<<<<hook queue<<<<<<<<<<>>>>>>>>>>>>>>");
	var txn = connection.transaction;
	if (!txn) return next();
                
	connection.loginfo('queue' + counter);

        setTimeout(function(){
                connection.loginfo('queue cb waiting ' + counter);
		next();
        }, 8000);
}
/*
function VerifyUserId(connection, next, to)
{
	function myCallBack (error, response, content) {
   	 	if (!error && response.statusCode == 404) {
        		connection.loginfo("USER NOT VALID : " + response.statusCode);
        		return next(DENYSOFT, "USER NOT VALID" + response.statusCode);
		}
   	 	if (error || response.statusCode != 200) {
        		connection.loginfo("Got error: " + response.statusCode);
        		return next(DENYSOFT, "REST ERROR" + response.statusCode);
		}
   	 	if (!error && response.statusCode == 200) {
       		 	connection.loginfo("Got response from server"); 
       		 	connection.loginfo(content); 
       		 	connection.loginfo("printed content"); 
        		var struct=JSON.parse(content);
        		connection.loginfo(struct.account.userId);
       		 	connection.loginfo("Verified user1 = " + struct.account.id); 
			connection.transaction.notes.itemizeid = struct.account.id;
			return next();
    			}
       	}	 	
//	var url = 'http://mule.itemize.com:9090/api/v1/accounts/' + to;
	var url = config.userurl + to;
	connection.loginfo("verify user: " + url); 
	var response=request.get(url, myCallBack).auth('itemize', 'itemize', true);
}
 
*/
