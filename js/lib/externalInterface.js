/*
	
	TODO
	need to implement all the ios.call methods for web/html only
	
*/

function ExternalInterface(){
	
	// call / callback
	this.callbacks = {};
	
	this.call = function(object, callback){
		var callbackId = Math.random().toString();
		if(callback) this.callbacks[callbackId] = callback;
		object['callbackId'] = callbackId;

		if(window.deviceType != undefined){
			var hash;
			try{
				hash = JSON.stringify(object);
			} catch(e){
				alert("Failed to stringify "+object);
				delete this.callbacks[callbackId];
				return;			
			}
			location.hash = hash;
		} else {
			// TODO - implement call and callback for html only
		}
	};
	
	this.executeCallback = function(callbackId, response){
		var callback = this.callbacks[callbackId];
		if(callback){
			callback(response);
			delete this.callbacks[callbackId];
		}
	};
	
	// override console.log
	if(window.deviceType != undefined){
		console.log = function(){
			var args = Array.prototype.slice.call(arguments, 0);
			for(var a in args){
				if(typeof(args[a]) == 'object') args[a] = JSON.stringify(args[a]);
			}
			ios.call({NSLog: args});
		};
		
		console.warn = function(){
			var args = Array.prototype.slice.call(arguments, 0);
			for(var a in args){
				if(typeof(args[a]) == 'object') args[a] = JSON.stringify(args[a]);
			}
			ios.call({NSLog: args});
		};

		console.error = function(){
			var args = Array.prototype.slice.call(arguments, 0);
			for(var a in args){
				if(typeof(args[a]) == 'object') args[a] = JSON.stringify(args[a]);
			}
			ios.call({NSLog: args});
		};
	}
	
	// sfx hooks
	this.playSound = function(fx, vol, delay){
		if(window.deviceType != undefined){
			this.call({playSound:fx, volume: (vol != undefined), delay: (delay != undefined) ? delay : 0});
		} else {
			// TODO - html only
			//console.log("Play sound:" + fx + " @", vol);
		}
	};
	
	this.loopSound = function(fx, vol) {
		if(window.deviceType != undefined){
			this.call({loopSound:fx, volume: (vol != undefined) ? vol : 1.0});
		} else {
			// TODO - html only
			//console.log("Play sound:" + fx + " @", vol);
		}
	}
	
	// smoothed motion tracking
	this.orientation = new THREE.Vector3();
	this.avgOrientation = new Array();
	this.orientationEventsPerSec = 30;
	
	window.ondevicemotion = function(event) { 
		if(renderer.paused) return;
		
		// queue
		var vec = null;
		if(ios.avgOrientation.length >= ios.orientationEventsPerSec){
			vec = ios.avgOrientation[0];
			ios.avgOrientation.splice(0,1);
		}		
		if(vec){
			vec.set(event.accelerationIncludingGravity.x, event.accelerationIncludingGravity.y, event.accelerationIncludingGravity.z);
		} else {
			vec = new THREE.Vector3(event.accelerationIncludingGravity.x, event.accelerationIncludingGravity.y, event.accelerationIncludingGravity.z);
		}
		ios.avgOrientation.push(vec);
		
		var x = 0, y = 0, z = 0;
		var x2 = 0, y2 = 0, z2 = 0;
		var tailAvg = Math.max(1, ios.avgOrientation.length - 10);
		var numTail = 0;
		for(var i = 0; i < ios.avgOrientation.length; i++){
			x += ios.avgOrientation[i].x;
			y += ios.avgOrientation[i].y;
			z += ios.avgOrientation[i].z;
			if(i >= tailAvg - 1){
				x2 += ios.avgOrientation[i].x;
				y2 += ios.avgOrientation[i].y;
				z2 += ios.avgOrientation[i].z;
				numTail++;
			}
		}
		numTail = 1.0 / numTail;
		x2 *= numTail;
		y2 *= numTail;
		z2 *= numTail;
		numTail = 1.0 / ios.avgOrientation.length;
		x *= numTail;
		y *= numTail;
		z *= numTail;
		
		ios.orientation.set((x2 - x),(y2 - y),(z2 - z));
	};
	
}

ios = new ExternalInterface();