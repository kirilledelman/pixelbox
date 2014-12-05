/* called on document load */
function documentReady(){

	// browser
	if(window.deviceType == undefined){
		window.innerWidth = 320;
		window.innerHeight = 600;
		$('body').css({width: '320px', height:'600px' });
	}

	// init renderer
	if(!renderer.init(1.0)){
		console.error("Your browser doesn't support WebGL");
		return;
	} else {
		$('canvas').css({left:'-100%'});
		console.log("WebGL initialized");
	}
	
	$('div.page-bg').addClass('backgroundZoomIn').css({backgroundSize: '256px 256px'});
	
	// show loading bar
	$('body').append('<div class="loading"><h2 class="center">Loading</h2><div id="bar"/><span id="percent">0%</span></div>');
	
	// load assets
	console.log("Loading assets");
	assets.loadAssets(function(done, percent){
		$('div.loading #bar').css({width: (6 * percent * 0.01)+'em'});
		
		if(done){
			$('#percent').text('');
			window.menuScene = new MenuScene();
			renderer.setScene(window.menuScene);
		} else {
			$('#percent').text(percent + '%');
		}
	});
}

/* app went to the background */
function pause(){
	if(!renderer.paused && renderer.currentScene == gameScene){
		$('#pause-game').trigger('touchstart');
	}
}

/* global helper functions */

THREE.Object3D.prototype.recursiveRemoveChildren = function(omit){
	var removedChildren = [];
	for(var i = 0; i < this.children.length; i++){
		var child = this.children[i];
		if(omit && omit.indexOf(child) !== -1){
			continue;
		}
		
		removedChildren = removedChildren.concat(child.recursiveRemoveChildren(omit));
		if(child.stopTweens) child.stopTweens();
		if(child.stopAnim) child.stopAnim();
		child.think = null;
		if(child['name']){
			if(child.anchored && this.parent[child.name]) {
				delete this.parent[child.name];
			} else if(this[child.name]){
				delete this[child.name];
			}
		}
		
		this.remove(child);
		removedChildren.push(child);
		
		i--;
	}
	
	return removedChildren;
};

/* pseudo - random */
Math.seededRandom = function(seed) {
	var x = Math.sin(seed+1) * 10000;
	return x - Math.floor(x);
};

/* cookies */
function createCookie(name, value, days) {
    var expires;

    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    } else {
        expires = "";
    }
    document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = encodeURIComponent(name) + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

/* deep clone */
_.deepClone = function(obj, depth) {
	if (typeof obj !== 'object') return obj;
	if (obj === null) return null;
	if (_.isString(obj)) return obj.splice();
	if (_.isDate(obj)) return new Date(obj.getTime());
	if (_.isFunction(obj.clone)) return obj.clone();
	var clone = _.isArray(obj) ? obj.slice() : _.extend({}, obj);
	// clone array's extended props
	if(_.isArray(obj)){
	  for(var p in obj){
		  if(obj.hasOwnProperty(p) && _.isUndefined(clone[p]) && isNaN(p)){
			  clone[p] = obj[p];
		  }
	  }
	}
	if (!_.isUndefined(depth) && (depth > 0)) {
	  for (var key in clone) {
	    clone[key] = _.deepClone(clone[key], depth-1);
	  }
	}
	return clone;
};