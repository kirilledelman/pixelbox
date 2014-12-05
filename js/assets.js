/* globals */

var assets = new Assets();

/* init */
function Assets(){
	this.cache = new THREE.Cache();
	this.textures = [
		'textures/transition/transition1.png',
		'textures/transition/transition2.png'
	];
	this.scenedata = [
		'json/menuScene.scene',
		'json/gameScene.scene'
	];
	this.models = [
		'json/tower1.b64',
		'json/tower2.b64',
		'json/windmill.b64',
		'json/house1.b64',
		'json/cloud.b64',
		'json/torch.b64',
		'json/crow.b64',
		'json/building.b64',
		'json/house2.b64',
		'json/fire.b64',
		'json/tree.b64',
		'json/explosion.b64',
		'json/adboard.b64',
		'json/spruce.b64',
		'json/car.b64',
		'json/train.b64',
		'json/igloo.b64',
		'json/road.b64',
		'json/santa.b64',
		'json/sled.b64',
		'json/deer.b64',
		'json/wolf.b64',
		'json/snow.b64',
		'json/milkglass.b64',
		'json/cookie.b64',
		'json/fireplace.b64',
		'json/instruction.b64',
		'json/present.b64'
	];
	this.totalLoaded = 0;
	this.totalAssets = 0;
	this.loadQueue = [];
	
	this.objectLoader = new THREE.JSONLoader();
	
	this.assetLoaded = function(){ 
		assets.totalLoaded++;
		assets.loadQueue.pop();
		assets.onloaded((assets.totalLoaded == assets.totalAssets), Math.round(100 * assets.totalLoaded / assets.totalAssets));
		setTimeout(assets.loadQueue[assets.loadQueue.length - 1], 10);		
	};
	
	this.loadAssets = function(onDone){
		this.onloaded = onDone;
		
		this.totalLoaded = 0;
		this.totalAssets = this.textures.length + this.scenedata.length + this.models.length;
		
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
							if(json.assets){
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
									THREE.PixelBox.prototype.processPixelBoxFrames(data);
								}
							}
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
							THREE.PixelBox.prototype.processPixelBoxFrames(json);
							assets.cache.add(json.name, json);
							console.log("["+json.name+"] process time:"+((new Date()).getTime() - time));
						}
						assets.assetLoaded();
					});
			}).bind(assets); }(url));
		}
		
		this.loadQueue[this.totalAssets - 1]();	
	};
}

