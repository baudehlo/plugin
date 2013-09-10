var fs = require('fs');
var tmp = require('tmp');
var request= require('request');
var http = require('http');
var async = require('async');


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
       		 	connection.loginfo(content); 
        		var struct=JSON.parse(content);
        		connection.loginfo(struct.userId);
    			connection.transaction.notes.itemizeid = struct.userId;
			return next();
    		}
	}
       		 	
	var url = 'http://mule.itemize.com:9090/api/v1/accounts/' + to;
	connection.loginfo("verify user: " + url); 
	var response=request.get(url, myCallBack).auth('itemize', 'itemize', true);
}
 
exports.hook_rcpt = function (next, connection) {
    var sys = require('util'),
    rest = require('restler');

    if (connection.transaction.rcpt_to.length > 1) {
        return next(DENYSOFT, "We only accept mail one recipient at a time");
    }

    var toaddr = connection.transaction.rcpt_to[0].address().toLowerCase();
    var to = toaddr.split('@')[0];	

    // Verify user
    VerifyUserId( connection, next, to);

}


exports.hook_data = function (next, connection) {
    connection.loginfo("<<<<<<<<<<<<<<<<<<<<<hook data");
    connection.transaction.parse_body = 1;
    connection.transaction.notes.attachment_tmpfiles = [];
    connection.transaction.notes.attachment_filesnames = [];
    connection.transaction.notes.attachment_filesct = [];
    connection.transaction.attachment_hooks( function (ct, fn, body, stream) {
    	    connection.loginfo("------ attachment cb");
    	    connection.loginfo(ct);
    	    connection.loginfo("------ attachment fn");
    	    connection.loginfo(fn);
    	    connection.loginfo("------ attachment body");
    	    connection.loginfo(body);
    	    tmp.file(function (err, path, fd) {
        	connection.loginfo("Got tempfile: " + path + " (" + fd + ")");
    	        connection.transaction.notes.attachment_tmpfiles.push(path);
    	        connection.transaction.notes.attachment_filesnames.push(fn);
    	        connection.transaction.notes.attachment_filesct.push(ct);
            	start_att(connection, ct, fn, body, stream, path, fd)
	   });
    });
    next();
}

function start_att (connection, ct, fn, body, stream, path, fd) {
    connection.loginfo("<<<<<<<<<<<<<<<<<<<<<Getting attachment");
    connection.loginfo("Got attachment: " + ct + ", " + fn + " for user id: " + "user");
    stream.connection = connection; // Allow backpressure
    stream.pause();

        var ws = fs.createWriteStream(path);
        stream.pipe(ws);
        stream.resume();
        connection.loginfo("after create write stream");
        ws.on('close', function ( ) {
//        ws.on('end', function ( ) {
//	    connection.pause();
            connection.loginfo("End of stream reached");
            fs.fstat(fd, function (err, stats) {
                connection.loginfo("Got data of length: " + stats.size);
            });
        });
}



function postAttachment(connection, callback, itemizeid, someObject, path, docs, id)
{
  function readFile(path,callback){
    function fileCallback(e,d){
        callback( new Buffer(d).toString('base64'));
    }
    fs.readFile(path,fileCallback);
  }

  function handleResponse(e, r, b) {
    if (!e && r.statusCode == 200) {
        connection.loginfo("Success")
        connection.loginfo("docid = " + b.itemizeId) 
    	docs.push(b.itemizeId);
	return callback(null, id.toString());
    }
    connection.loginfo(r);
    connection.loginfo("status:" + r.statusCode);
    connection.loginfo("response body:" + JSON.stringify(r.body));
  }

  var url = "http://mule.itemize.com:9090/api/v1/accounts/" + itemizeid + "/documents";
  var auth = {'user': "itemize", 'pass': "itemize", 'sendImmediately': true}

  readFile(path,function(content){
    connection.loginfo("read attachment");
    connection.loginfo("Going to write attachment>>");
    request.post({url:url,auth: auth, json: true, body: someObject}, handleResponse);
  });
}


function postEnvelop(connection, callback, itemizeid, someObject, id)
{
	var request = require('request')
	var url = "http://mule.itemize.com:9090/api/v1/accounts/" + itemizeid +  "/envelopes";

	function handleResponse(e, r, b) {
    		if (!e && r.statusCode == 200) {
        			connection.loginfo("SuCCESS"); // Print the google web page.
        			connection.loginfo(b);
				return callback(null, id.toString());
			}
			connection.loginfo(r);
			connection.loginfo("status:" + r.statusCode);
			connection.loginfo("response body:" + JSON.stringify(r.body));
	}
	var str = JSON.stringify(someObject); 
	connection.loginfo(str);
	var auth = {'user': "itemize", 'pass': "itemize", 'sendImmediately': true}
	request.post({url:url,auth: auth, json: true, body: someObject}, handleResponse);
}

exports.hook_queue = function (next, connection) {
	connection.loginfo("<<<<<<<<hook queue<<<<<<<<<<>>>>>>>>>>>>>>");
	var txn = connection.transaction;
	if (!txn) return next();

	txn.message_stream.get_data(function (msg) {
		
		connection.loginfo("<<<<<>>>>>");
		connection.loginfo(msg);
		connection.loginfo('get data');

		function extractChildren(children) {
			return children.map(function (child) {
		    		var data = {
					bodytext: child.bodytext,
					headers: child.header.headers_decoded,
					bodyencoding: child.body_encoding,
					is_html: child.is_html,
					state: child.state
		    		}
		    		if (child.children.length > 0) 
					data.children = extractChildren(child.children);
		    		return data;
			})
		}

      		var bodytext = connection.transaction.body.bodytext;
      		var ct = "body/text";
		var htmlflag = false;
//		ct = connection.transaction.header.get('content-type');

      		var body_child_array = extractChildren(connection.transaction.body.children);
      		connection.loginfo(body_child_array.length);
      		for (var i = 0; i < body_child_array.length; i++) {
        		var body_child_each = body_child_array[i];
      			connection.loginfo("part=" + i );
      			connection.loginfo(body_child_each);
      			connection.loginfo("part=" + i + "  " + body_child_each.headers);
      			connection.loginfo("part=" + i + "  " + body_child_each.state);
			connection.loginfo( body_child_each.headers['content-type'] );

			// Multipart processing
			//
			var child_ct;
 			if ((child_ct = /^multipart\/alternative/.exec(body_child_each.headers['content-type']))) {
				connection.loginfo( child_ct );
				connection.loginfo( body_child_each.children.length);
      				for (var j = 0; j < body_child_each.children.length; j++) {
        				var child  = body_child_each.children[j];
					connection.loginfo( "chil : j = " + j + " " + child.state );
					if(child.state == "body")
					{
						bodytext = child.bodytext;
						htmlflag = child.is_html;
					}
				}	
				continue;
			}

			// Not Multipart
        		if(body_child_each.state == "body" ){
				connection.loginfo( body_child_each.headers['content-type'] );
				connection.loginfo( body_child_each.bodytext );
       		     		bodytext = body_child_each.bodytext;
				connection.loginfo("override body text");
				ct =  body_child_each.headers['content-type'];
				if(body_child_each.is_html)
					htmlflag = true;
				connection.loginfo("override content type");
			}
      		}


		var counter = 0;
		function  postAttachmentWrapper(callback)
		{
   			var someObject = {};
			someObject.type =  txn.notes.attachment_filesct[counter];
			someObject.name =  txn.notes.attachment_filesnames[counter];
			var path = txn.notes.attachment_tmpfiles[counter];
			
			connection.loginfo("counter = " + counter);
			postAttachment(connection, callback, itemizeid, someObject, path, docs, counter++);
		}

		function  postEnvelopWrapper(callback)
		{
   			var someObject = {};
		//      someObject.sentDate =  connection.transaction.header.headers.date;
		//      someObject.receiveDate = new Date();
    			someObject.sentDate =  1376497682598;
    			someObject.receivedDate = 1376497682598;
        		someObject.from = connection.transaction.header.get_decoded('from');
        		someObject.to = connection.transaction.rcpt_to[0].address().toLowerCase();
        		someObject.subject = connection.transaction.header.get_decoded('subject');
 			if ( htmlflag == true) someObject.htmlBody = bodytext;
			else someObject.textBody = bodytext;
    			if( docs.length > 0)     // there are attachments
        		{
                		someObject.docIds = docs;
        		}
			connection.loginfo("counter = " + counter);
			postEnvelop(connection, callback, itemizeid, someObject, counter);
		}

	var arrf = [];
      	var  docs  = [];
      	var itemizeid = connection.transaction.notes.itemizeid;
      	connection.loginfo("attachment files");
      	connection.loginfo(txn.notes.attachment_tmpfiles.length);
      	for (var i = 0; i < txn.notes.attachment_tmpfiles.length; i++) {
		connection.loginfo(txn.notes.attachment_tmpfiles[i]);
		connection.loginfo(txn.notes.attachment_filesnames[i]);
		connection.loginfo(txn.notes.attachment_filesct[i]);
		arrf[i] = postAttachmentWrapper;
      	}

   	arrf[i] = postEnvelopWrapper;	
      	connection.loginfo("before async^^^^^^^^^^^^^^^^^");
	connection.loginfo(arrf.length);

	async.series(arrf, 
		function(err, results){
    			// results is now equal to ['1'] ['2']
			connection.loginfo("<<<<<<<<<<<<<CALLBACK>>>>");
			connection.loginfo(results);
			return next(OK, 'Queued OK'); 
		});
  })

}

