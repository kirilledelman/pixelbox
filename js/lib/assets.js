/* 

	THREE.PixelBoxAssets is used by THREE.PixelBoxScene
	
	see examples on how to use
	
*/

THREE.PixelBoxAssets = function(){

/*
	
	loadAssets(info) - loads and caches data
	
		(Object) info - specifies what to load (all params optional)
		
			(Array) info.textures - array of paths to images to load as THREE.Texture
			(Array) info.assets - array of paths to json or LZ-String-compressed PixelBox asset files
			(Array) info.scenes - array of paths to json or LZ-String-compressed PixelBox scene files
			(Array) info.json - array of paths to json files to load and parse
			
			(Function) info.progress(percent) - function called after each file is loaded
			(Function) info.done - function called after all assets have been loaded

*/

	this.loadAssets = function(params, onLoaded){
		this.textures = params.textures ? params.textures : [];
		this.scenedata = params.scenes ? params.scenes : [];
		this.models = params.assets ? params.assets : [];
		this.json = params.json ? params.json : [];
		this.onprogress = params.progress;
		this.onloaded = params.done;
		
		this.totalLoaded = 0;
		this.totalAssets = this.textures.length + this.scenedata.length + this.models.length + this.json.length;
		
		// textures
		for(var i = 0; i < this.textures.length; i++){
			var url = this.textures[i];
			this.loadQueue.push(function(url) { return (function(){
				this.cache.add(url, new THREE.ImageUtils.loadTexture(url, undefined, this.assetLoaded));
			}).bind(assets); }(url));
		}
		
		// scenes
		for(var i = 0; i < this.scenedata.length; i++){
			var url = this.scenedata[i];
			this.loadQueue.push(function(url) { return (function(){
				$.ajax(url).
					done(function(data) {
						// decompress if needed
						var json;
						if(data.substr(0,1) == '{' || data.substr(0,1) == '['){
							json = data;
						} else {
							json = LZString.decompressFromBase64(data);
						}
						// parse
						if(!json){
							console.error("Failed to LZString decompressFromBase64 "+url);
						} else {
							try {
								json = JSON.parse(json);
							} catch(e){
								console.error("Failed to parse JSON for "+url,e,json);
							}
							// process scene's assets
							/*if(json.assets){
								for(var i in json.assets){
									var data = json.assets[i];
									// compressed as string? uncompress and parse
									if(typeof(data) == 'string'){
										data = LZString.decompressFromBase64(data);
										try {
											data = JSON.parse(data);
										} catch(e){
											console.error("Failed to parse JSON in scene asset:"+data, e, json);
										}
									}
									json.assets[i] = data;
									
									// process
									THREE.PixelBoxUtil.processPixelBoxFrames(data);
								}
							}*/
							assets.cache.add(json.name, json);
						}
						assets.assetLoaded();
					});
			}).bind(assets); }(url));
		}
		
		// models
		for(var i = 0; i < this.models.length; i++){
			var url = this.models[i];
			this.loadQueue.push(function(url) { return (function(){
				$.ajax(url).
					done(function(data) {
						// decompress if needed
						var time = new Date();
						var json;
						if(data.substr(0,1) == '{'){
							json = data;
						} else {
							json = LZString.decompressFromBase64(data);
						}
						// parse
						if(!json){
							console.error("Failed to LZString decompressFromBase64 "+url);
						} else {
							try {
								json = JSON.parse(json);
							} catch(e){
								console.error("Failed to parse JSON for "+url,e,json);
							}
							console.log("["+json.name+"] decompress+parse time:"+((new Date()).getTime() - time));

							// process
							time = new Date();
							THREE.PixelBoxUtil.processPixelBoxFrames(json);
							assets.cache.add(json.name, json);
							console.log("["+json.name+"] process time:"+((new Date()).getTime() - time));
						}
						assets.assetLoaded();
					});
			}).bind(assets); }(url));
		}
		
		// json
		for(var i = 0; i < this.json.length; i++){
			var url = this.json[i];
			this.loadQueue.push(function(url) { return (function(){
				$.ajax(url).
					done(function(data) {
						// decompress if needed
						var json;
						if(data.substr(0,1) == '{'){
							json = data;
						} else {
							json = LZString.decompressFromBase64(data);
						}
						// parse
						if(!json){
							console.error("Failed to LZString decompressFromBase64 "+url);
						} else {
							try {
								json = JSON.parse(json);
							} catch(e){
								console.error("Failed to parse JSON for "+url,e,json);
							}
							// process
							assets.cache.add(url, json);
						}
						assets.assetLoaded();
					});
			}).bind(assets); }(url));
		}
		
		// start
		if(this.totalAssets) this.loadQueue[this.totalAssets - 1]();	
		else if(this.onloaded) this.onloaded();
	};
	
	this.assetLoaded = function(){ 
		assets.totalLoaded++;
		assets.loadQueue.pop();
		if(assets.totalLoaded == assets.totalAssets){
			if(assets.onloaded) assets.onloaded();
		} else {
			if(assets.onprogress) assets.onprogress(100 * assets.totalLoaded / assets.totalAssets);
			setTimeout(assets.loadQueue[assets.loadQueue.length - 1], 10);
		}
	};

	this.unload = function(){
		for(var key in this.cache.files){
			var a = this.cache.files[key];
			// PixelBox
			if(a.frameData || a.frames){
				THREE.PixelBox.prototype.dispose(a);
			} else if(a instanceof THREE.Texture){
				a.dispose();
			}
		}
		this.cache.clear();
		console.log("All assets unloaded");
	};	
	this.cache = new THREE.Cache();
	this.totalLoaded = 0;
	this.totalAssets = 0;
	this.loadQueue = [];
	
	this.objectLoader = new THREE.JSONLoader();
}

var assets = new THREE.PixelBoxAssets();
