var fs = require('fs');
var Steam = require('steam');
var request = require('request');
var config = require('./config.json');
var localList = require('./localList.json');
var he = require('he');

/* Bot variables */
var botInfo = config.botInfo;
var date = new Date();
var AMPM;
var datetime = {
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
};
var currentTime;
var currentDate = (datetime.year + "-" + (datetime.month.toString().length === 1 ?  "0" + datetime.month : datetime.month) + "-" + (datetime.day.toString().length === 1 ? "0" + datetime.day : datetime.day));
var intervals = {
	dateInterval: 0
};

/* Main stuff */

// if we've saved a server list, use it
if (fs.existsSync('servers')) {
	Steam.servers = JSON.parse(fs.readFileSync('servers'));
}
if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str) {
        return this.substring(0, str.length) === str;
    };
}
if (typeof String.prototype.endsWith != 'function') {
    String.prototype.endsWith = function (str) {
        return this.substring(this.length - str.length, this.length) === str;
    };
}

var bot = new Steam.SteamClient();
bot.logOn({
	accountName: config.logins.accountName,
	password: config.logins.password
});
bot.on('loggedOn', function() {
	console.log('Logged in!');
	bot.setPersonaState(Steam.EPersonaState.Online); // to display your bot's status as "Online"
	bot.setPersonaName('Linkbot'); // to change its nickname
	for (var group in botInfo.groups) {
		initiateGroups(botInfo.groups[group]);
		bot.joinChat(group);
		log("Joining: " + botInfo.groups[group].name);
	}
});
bot.on('servers', function(servers) {
	fs.writeFile('servers', JSON.stringify(servers));
});
bot.on('chatInvite', function(chatRoomID, chatRoomName, patronID) {
	console.log('Got an invite to ' + chatRoomName + ' from ' + bot.users[patronID].playerName);
	if (patronID === botInfo.master) {
		bot.joinChat(chatRoomID);
	}
});

bot.on('chatMsg', function(chatID, message, type, chatter) {
	var poster = bot.users[chatter].playerName;
	console.log("[ " + chatter + " ] " + poster + ": " + message);
	
	if (config.botInfo.ignore.people.indexOf(chatter) > -1) { log("warn", "This user is on the ignore list."); return false;}
	testForURL(message, function(extractedURL, extra) {
		visitURL(extractedURL, function(isJSON, title, streamerInfo) {
			var finalMessage;
			
			if (isJSON) {
				if (streamerInfo.stream) {
					
				}
			} else {
				title.length > botInfo.groups[chatID].options.maxCharLength ? title = title.substring(0, botInfo.groups[chatID].options.maxCharLength) + " [Rest Omitted]": title = title;
				finalMessage = (poster + " posted: " + title + " " + (extra !== undefined ? extra : ""));
			}
			
			if (date.getTime() > botInfo.groups[chatID].options.coolDown) {
				bot.sendMessage(chatID, finalMessage);
				botInfo.groups[chatID].options.coolDown = date.getTime() + botInfo.groups[chatID].options.coolDownInterval;
			} else {
				log("warn", "Cooldown set for " + chatID + " has not been reached.");
			}
		});
	});
	
});
bot.on('chatStateChange', function(state, reciever, chatID, sender) {
	if (state == Steam.EChatMemberStateChange.Entered && sender === bot.id) {
		log("Joined: " + botInfo.groups[chatID].name);
	}
});
/* Function Declarations */
function log() {
	var types = {
		info: "[INFO]",
		warn: "[WARN]",
		error: "[ERROR]",
		sent: "[SENT]",
		received: "[RECEIVED]",
		func: "[FUNCTION STARTED]"
	}
	if (arguments.length === 0 ) return false;
	if (arguments.length === 1) {
		console.log(types.info + ": " + arguments[0]);
	} else if (arguments.length === 2) {
		console.log(types[arguments[0].toLowerCase()] + ": " + arguments[1]);
	}
}
function execIntervalCode(vari, limit, callback) {
    if (intervals[vari] < limit) {
        intervals[vari] += 1;
    } else if (intervals[vari] >= limit) {
        if (typeof(callback) === 'function') {
            callback();
        }
        intervals[vari] = 0;
    }
}
function initiateGroups(group) { //Defaults, realized I have yet to actually save the JSON.
	if (!(group.options)) {
		group.options = {};
	}
	group.options.maxCharLength === undefined ? group.options.maxCharLength = 750 : group.options.maxCharLength = group.options.maxCharLength;
	group.options.coolDown === undefined ? group.options.coolDown = 0 : group.options.coolDown = group.options.coolDown;
	group.options.coolDownInterval === undefined ? group.options.coolDownInterval = 0 : group.options.coolDownInterval = group.options.coolDownInterval;
}
function updateList(callback) {
	log("func", "Update List");
	var dayNum = date.getUTCDate();
	var lastUpdateDate = localList.lastUpdateDate || undefined;
	
	if (lastUpdateDate != dayNum) {
		log("warn","The game list is out of date, updating now...");
		request('http://api.steampowered.com/ISteamApps/GetAppList/v0002/', function (error, response, body) {
			if (!error && response.statusCode == 200) {
				body = JSON.parse(body);
				var preLocalList = {
					lastUpdateDate: dayNum,
					applist: body.applist
				}
				
				fs.writeFile('./localList.json', JSON.stringify(preLocalList, null, "\t"), function (err) {
					if (err) throw err;
					localList = preLocalList;
					log('The game list has been updated.');
					callback();
				});
			}
		});
	} else {
		log("List up to date");
		callback();
	}
}
function searchForGame(forThis, callback) {
	log("func", "Searching For Game")
	var resultsArr = [];
	var gameList = localList.applist.apps;
	
	for (var i=0; i<gameList.length; i++) {
		if (gameList[i].name.toUpperCase().indexOf(forThis.toUpperCase()) > -1) {
        	resultsArr.push(gameList[i]);
    	}
	}
	
	resultsArr.sort(function(a,b) {
    	if (a.name.length < b.name.length) {
    	    return -1;
    	} else if (a.name.length > b.name.length) {
    	    return 1;
    	} else { 
    	    return 0;
    	}
	});
	
	if (resultsArr.length > 0) {
		callback(resultsArr[0]);
	}
}
function testForURL(message, callback) {
	var exURL;
	var extra;
	
	if (message.startsWith("!linkme ")) {
		var inputTitle = message.substring(message.indexOf("!linkme ") + 8, message.length);
		
		updateList(function() {
			searchForGame(inputTitle, function(resultObj) {
				message = "http://store.steampowered.com/app/" + resultObj.appid;
				extra = message;
			});
		});
	} else {
		switch(true) {
			case message.startsWith("/r/"):
				message = "http://reddit.com" + message;
				extra = message;
				break;
			case message.startsWith("r/"):
				message = "http://reddit.com/" + message;
				extra = message;
				break;
		}
	}
	
	if (message.indexOf('http') > -1) {
		log("func", "Extracting URL");
        message.indexOf(" ", message.indexOf("http")) === -1 ? exURL = message.substring(message.indexOf("http"), message.length) : exURL = message.substring(message.indexOf("http"), message.indexOf(" ", message.indexOf("http")));
		if (exURL.indexOf("://i.imgur.com/") > -1) exURL = exURL.substring(0, exURL.length - 4).replace("i.imgur.com", "imgur.com");
		for (var partial=0; partial<config.botInfo.ignore.urls.length; partial++) {
			if (exURL.indexOf(config.botInfo.ignore.urls[partial]) > -1) {
				log("warn", "The link contains part of a url that is on the ignore list.");
				return false;
			}
		}
		log("URL found: " + exURL);
		callback(exURL, extra);
	}
}
function visitURL(URL, callback) {
	log("func", "Visit URL");
	var streamArr = [];
	var maxSize = botInfo.maxRequestSizeMB * 1024 * 1024;
	var rt;
	
	var req = request(URL, function(err, res, body) {
		if (!err && res.statusCode == 200) {
			if (body) {
				try {
					var streamerInfo = JSON.parse(body);
					rt = true;
					callback(true, null, streamerInfo);
				} catch(e) {
					if (body.indexOf('<title>') == -1) {
						log("warn", "The posted link contains no title");
					} else {
						var title = he.decode(body.substring(body.indexOf('<title>') + 7, body.indexOf('</title>'))).trim();
						for (var partial=0; partial<config.botInfo.ignore.titles.length; partial++) {
							if (title === config.botInfo.ignore.titles[partial]) {
								log("warn", "The link contains a title that is on the ignore list");
								return false;
							}
						}
						rt = true;
						callback(false, title);
					}
				}
			}
		}
	}).on('data', function(chunk) {
		streamArr += chunk;
		if (streamArr.length > maxSize) {
			log("error", "The request was larger than " + maxSize);
			req.abort();
		}
		if (!rt) {
			rt = setTimeout(function() {
				log("error", "Took over 2.5 seconds to parse page.");
				req.abort();
			}, 2500);
		}
	});
}

/* Intervals */
setInterval(function() {
	execIntervalCode('dateInterval', 1, function() {
        var fixedHours;

        date = new Date();
	    datetime.day = date.getUTCDate();
	    datetime.month = date.getUTCMonth() + 1;
	    datetime.year = date.getUTCFullYear();
	
        datetime.hours = date.getUTCHours();
        datetime.minutes = date.getUTCMinutes();
        datetime.seconds = date.getUTCSeconds();
		
        if (datetime.hours > 11) {
				AMPM = "PM";
			if (datetime.hours > 12) {
				fixedHours = datetime.hours - 12;
			} else {
				fixedHours = datetime.hours;
			}
        } else {
                AMPM = "AM";
        }
		
        currentTime = (fixedHours + ":" + (datetime.minutes.toString().length === 1 ? "0" + datetime.minutes : datetime.minutes) + ":" + (datetime.seconds.toString().length === 1 ? "0" + datetime.seconds : datetime.seconds) +" " + AMPM);
        currentDate = (datetime.year + "-" + (datetime.month.toString().length === 1 ?  "0" + datetime.month : datetime.month) + "-" + (datetime.day.toString().length === 1 ? "0" + datetime.day : datetime.day));
	});
}, 1);
