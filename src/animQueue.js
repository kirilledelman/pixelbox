/*
 * @author Kirill Edelman
 * @source https://github.com/kirilledelman/pixelbox
 * @documentation https://github.com/kirilledelman/pixelbox/wiki
 * @license MIT
*/

function AnimQueue ( fps ) {
	
	this._fps = fps;
	this._timer = 0;
	
	var queue = [];
	
	// timer
	this.restartTimer = function () {
	
		if ( this._timer ) { 
			
			clearInterval( this._timer );
			
		}
		
		this._timer = setInterval( this.tick, 1000 / this._fps );
		
	};
	
	// tick updates / executes all queued objects
	this.tick = function ( delta ) {
		
		if ( this._fps ) {
		
			if ( renderer.paused ) return;
			
			delta = 1.0 / this._fps;
			
		}		
		
		var obj;
		
		for ( var i = queue.length - 1; i !== -1; i-- ){
			
			obj = queue[ i ];
			
			obj.timeOut -= delta;
			
			if ( obj.timeOut <= 0 ) { 
				
				obj.func();
				
				queue.splice( i, 1 );
				
			}
			
		}
		
		if ( !queue.length && this._timer ) { 
			
			clearInterval( this._timer );
			this._timer = 0;
			
		}
		
	}.bind( this );
	
	// adds a func to queue
	this.enqueue = function ( funcToCall, secondsFromNow ) {
	
		var obj = { func: funcToCall, timeOut: secondsFromNow };
		
		queue.push( obj );
		
		if ( this._fps && !this._timer ) this._timer = setInterval( this.tick, 1000 / this._fps );
		
	};
	
	// cancels specific function
	this.cancel = function ( func ) {
	
		for ( var i = queue.length - 1; i !== -1; i-- ){
			
			var obj = queue[ i ];
			
			if ( obj.func === func ) { 
			
				queue.splice( i, 1 );
				return;				
			
			}
			
		}			
		
	};
	
	// reschedules a specific function
	this.adjustTime = function ( func, newTimeoutValue ) {
		
		for ( var i = queue.length - 1; i !== -1; i-- ){
			
			var obj = queue[ i ];
			
			if ( obj.func === func ) { 
				
				obj.timeOut = newTimeoutValue;
				return;
				
			}
			
		}
		
	};	
	
	return this;
	
}

