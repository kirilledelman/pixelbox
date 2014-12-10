chrome.app.runtime.onLaunched.addListener(function() {
  // Center window on screen.
  chrome.storage.local.get(['windowWidth', 'windowHeight'], function(res){
	  var screenWidth = screen.availWidth;
	  var screenHeight = screen.availHeight;
	  var width = Math.round((res && res.windowWidth) ? res.windowWidth : (screen.availWidth * 0.75));
	  var height = Math.round((res && res.windowHeight) ? res.windowHeight : (screen.availHeight * 0.75));
	  chrome.app.window.create('editor/index.html', {
	    id: "sceneEditor",
	    outerBounds: {
	      width: width,
	      height: height,
	      left: Math.round((screenWidth-width)/2),
	      top: Math.round((screenHeight-height)/2)
	    }
	  });
	}); 
});