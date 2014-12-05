/*

	export output of smoothNormals is "string" ?
	
	upon load optimize, smooth, and other "preview" values arent populated

	Next:

	Enter key should hit default confirm button in dialogs (import)

	Never start stroke if controls.state != none

	# Improvements
	
	automaticColors could be based on hashes of the anim name - to avoid color jumping
	
	Save camera position with hold doc
	
	Export - download as file (open in new tab as data)
			- download as file with higher compression?	

	Only redraw screen when needed. Maybe skip rendering in renderer's render(), and just return after requesting anim frame?

	# Minor bugs
	
	Deleting frames doesnt update range slider min/max and values
	
	# Ideas / far future
	
	
	Brush color op - normal, brighten, darken, opacity...
	
	Ghost model or brush - load a 3d model and use as a ghost for sculpting, or fill pixelbox / model intersection with current color 
	
	Encode option as PNG - send a picture 
	
*/

function EditScene(){
	
	this.initUndo();
	
	this.maskingMode = 'xyz';
	this.shift = false;
	this.ctrl = false;
	this.alt = false;
	
	this.mouseCoord = {x: 0, y: 0};
	this.intersectingMask = null;
	this.intersectingPaste = null;
	this.intersectingMaskBack = null;
	this.intersectionTestBox = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xff0000, wireframe: true}));
		
	this._currentFrame = 0;
	this.playing = false;
	this.frameAfterPlaying = 0;
	
	this.movingMask = false;
	this.movingMaskEnabled = false;
	
	this.stroking = false;
	this.canStroke = false;
	this.canvasInteractionsEnabled = true;
	this.disableCanvasInteractionsOnRelease = false;
	
	this.strokeColor = new THREE.Color(0xFFFFFF);
	this.strokeOpacity = 1.0;
	this.strokeBrightness = 0.0;
	this.strokeSize = 1;
	this.checkContiguous = (localStorage.getItem('checkContiguous') !== 'false');
	this.paintAlpha = 1;
	this.strokeMode = 0;
	this.brushSizeOffsets = [
		[[0,0]], // 1
		[[-0.5,-0.5], [0.5,-0.5], [-0.5,0.5], [0.5,0.5] ], // 2
		[[0,0], [1,0], [-1,0], [0, 1], [0, -1]], // 3
		[[-0.5,-0.5], [0.5,-0.5], [-0.5,0.5], [0.5,0.5], [-1.5,-0.5], [-0.5,-1.5], [1.5,0.5], [0.5,1.5], [-1.5,0.5], [-0.5,1.5], [1.5,-0.5], [0.5,-1.5] ] // 4
	];
	
	this._pasteMode = false;
	this._fillMode = false;
	this.movingPaste = false;
	this.autoStorePastePos = (localStorage.getItem('autoStorePastePos') === 'true');
	
	this.thumbnails = [];
	var renderTargetParameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };
	this.thumbnailCameraUserAngle = localStorage.getItem('thumbnailCameraUserAngle');
	if(this.thumbnailCameraUserAngle !== null){
		var p = this.thumbnailCameraUserAngle.split(',');
		this.thumbnailCameraUserAngle = new THREE.Vector3(parseFloat(this.thumbnailCameraUserAngle[0]),parseFloat(this.thumbnailCameraUserAngle[1]),parseFloat(this.thumbnailCameraUserAngle[2]));
	}
	this.thumbfbo = new THREE.WebGLRenderTarget( 64, 64, renderTargetParameters );
}

EditScene.prototype = {

/* ------------------- ------------------- ------------------- ------------------- ------------------- Lights */
	
	lightColorChanged:function(hsb, hex, rgb, div){ 
		localStorage.setItem(div.id, hex);
		$(div).css('background-color','#'+hex);
		hex = parseInt(hex, 16);
		switch(div.id){
		case 'ambient-color':
			editScene.ambient.color.set(hex);
			break;
		case 'hemi-color':
			editScene.hemi.color.set(hex);
			break;
		case 'hemi-ground-color':
			editScene.hemi.groundColor.set(hex);
			break;
		case 'point-color':
			editScene.point.color.set(hex);
			editScene.pointHelper.update();
			break;
		case 'direct-color':
			editScene.sun.color.set(hex);
			editScene.sunHelper.update();
			break;
		case 'spot-color':
			editScene.spot.color.set(hex);
			editScene.spotHelper.update();
			break;
		}
	},
	
	lightIntensityChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value * 0.01;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'hemi-intensity':
			editScene.hemi.intensity = val;
			break;
		case 'point-intensity':
			editScene.point.intensity = val;
			editScene.pointHelper.update();
			break;
		case 'direct-intensity':
			editScene.sun.intensity = val;
			editScene.sun.shadowDarkness = Math.min(1.0, val * 0.5);
			editScene.sunHelper.update();
			break;
		case 'spot-intensity':
			editScene.spot.intensity = val;
			editScene.spot.shadowDarkness = Math.min(1.0, val * 0.5);
			editScene.spotHelper.update();
			break;
		}		
	},

	lightDirectionChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'point-direction':
			editScene.updatePointLightPos();
			break;
		case 'direct-direction':
			editScene.updateDirectLightPos();
			break;
		case 'spot-direction':
			editScene.updateSpotLightPos();
			break;
		}
	},
	
	lightElevationChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'point-elevation':
			editScene.updatePointLightPos();
			break;
		case 'direct-elevation':
			editScene.updateDirectLightPos();
			break;
		case 'spot-elevation':
			editScene.updateSpotLightPos();
			break;
		}
	},

	lightDistanceChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'point-distance':
			editScene.updatePointLightPos();
			break;
		case 'spot-distance':
			editScene.updateSpotLightPos();
			break;
		}
	},

	lightFalloffChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'point-falloff':
			editScene.point.distance = ui.value;
			break;
		case 'spot-falloff':
			editScene.spot.distance = ui.value;
			break;
		}
	},
	
	lightExpChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'spot-exp':
			editScene.spot.exponent = val;
			break;
		}
	},
	
	lightAngleChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = Math.PI * ui.value / 180;
		localStorage.setItem(targid, val);
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'spot-angle':
			editScene.spot.angle = val;
			editScene.spotHelper.update();
			break;
		}
	},
	
	lightTabChanged:function(e, ui){
		editScene.pointHelper.visible = (ui.newTab.context.hash == '#tab-point');
		editScene.sunHelper.visible = (ui.newTab.context.hash == '#tab-direct');
		editScene.spotHelper.visible = (ui.newTab.context.hash == '#tab-spot');
		editScene.sunHelper.update();
		editScene.spotHelper.update();
	},
	
	updatePointLightPos:function(){
		var elev, distance, direction, eu;
		elev = localStorage.getItem('point-elevation');
		distance = localStorage.getItem('point-distance');
		direction = localStorage.getItem('point-direction');
		
		this.point.elev = elev = Math.PI * (elev !== null ? parseFloat(-elev) : -45) / 180;
		this.point.direction = direction = Math.PI * (direction !== null ? parseFloat(direction) : 0) / 180;
		this.point.dist = distance = distance !== null ? parseFloat(distance) : 200;
		
		eu = new THREE.Euler(elev, direction, 0, 'YXZ');		
		this.point.position.set(0, 0, 1).applyEuler(eu).multiplyScalar(distance);
		if(this.doc){
			var center = new THREE.Vector3(this.doc.width * 0.5, this.doc.height * 0.5, this.doc.depth * 0.5);
			this.point.position.add(center);
		}
	},
	
	updateDirectLightPos:function(){
		var elev, distance, direction, eu;
		elev = localStorage.getItem('direct-elevation');
		direction = localStorage.getItem('direct-direction');
		
		this.sun.elev = elev = Math.PI * (elev !== null ? parseFloat(-elev) : -80) / 180;
		this.sun.direction = direction = Math.PI * (direction !== null ? parseFloat(direction) : 90) / 180;
		
		eu = new THREE.Euler(elev, direction, 0, 'YXZ');		
		this.sun.position.set(0, 0, 1).applyEuler(eu).multiplyScalar(500);
		if(this.doc){
			var center = new THREE.Vector3(this.doc.width * 0.5, this.doc.height * 0.5, this.doc.depth * 0.5);
			this.sun.position.add(center);
			this.sun.target.position.copy(center);
			this.sun.updateMatrixWorld(true);
		}
		this.sunHelper.update();
		//setTimeout(this.sunHelper.update.bind(this.sunHelper), 10);
	},
	
	updateSpotLightPos:function(){
		var elev, distance, direction, eu;
		elev = localStorage.getItem('spot-elevation');
		direction = localStorage.getItem('spot-direction');
		distance = localStorage.getItem('spot-distance');
		
		this.spot.elev = elev = Math.PI * (elev !== null ? parseFloat(-elev) : -80) / 180;
		this.spot.direction = direction = Math.PI * (direction !== null ? parseFloat(direction) : 90) / 180;
		this.spot.dist = distance = distance !== null ? parseFloat(distance) : 200;
		
		eu = new THREE.Euler(elev, direction, 0, 'YXZ');		
		this.spot.position.set(0, 0, 1).applyEuler(eu).multiplyScalar(distance);
		if(this.doc){
			var center = new THREE.Vector3(this.doc.width * 0.5, this.doc.height * 0.5, this.doc.depth * 0.5);
			this.spot.position.add(center);
			this.spot.target.position.copy(center);
			this.spot.updateMatrixWorld(true);
		}
		this.spotHelper.update();
		//setTimeout(this.spotHelper.update.bind(this.spotHelper), 10);
	},
	
	lightShadowChanged:function(e){
		var targid = $(e.target).attr('id');
		var val = e.target.checked;
		localStorage.setItem(targid, val);
		switch(targid){
		case 'spot-shadow':
			editScene.spot.castShadow = val;
			renderer.webgl.clearTarget(editScene.spot.shadowMap);
			break;
		case 'direct-shadow':
			editScene.sun.castShadow = val;
			renderer.webgl.clearTarget(editScene.sun.shadowMap);
			break;
		}
		editScene.model.material.needsUpdate = true;
		editScene.shadowPreviewPlane.material.needsUpdate = true;
		THREE.PixelBox.updateLights(editScene.scene);
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Painting */
	
	fillModeChanged:function(e){
		editScene._fillMode = e.target.checked;
	},

	checkContiguousChanged:function(e){
		editScene.checkContiguous = e.target.checked;
		localStorage.setItem('checkContiguous', editScene.checkContiguous);
	},
	
	eyedropperFrom:function(obj){
		this.strokeColor.set(obj.c);
		this.strokeOpacity = obj.a;
		this.strokeBrightness = obj.b;
		
		$('#stroke-color').colpickSetColor({r:this.strokeColor.r * 255,g:this.strokeColor.g * 255,b:this.strokeColor.b * 255},false);
		
		$('#stroke-opacity').slider('value', Math.round(editScene.strokeOpacity * 100));
		$('#stroke-opacity .ui-slider-handle').text(Math.floor(editScene.strokeOpacity * 100));

		$('#stroke-brightness').slider('value', Math.round(editScene.strokeBrightness * 100));
		$('#stroke-brightness .ui-slider-handle').text(Math.floor(editScene.strokeBrightness * 100));
	},
	
	strokeColorChanged: function(hsb, hex, rgb){ 
		editScene.strokeColor.set(parseInt(hex,16));
	},

	paintAlphaChanged: function(e, ui){ editScene.paintAlpha = ui.value * 0.01; $('#paint-alpha .ui-slider-handle').text(Math.floor(editScene.paintAlpha * 100)); },
	
	strokeOpacityChanged: function(e, ui){ editScene.strokeOpacity = ui.value * 0.01; $('#stroke-opacity .ui-slider-handle').text(Math.floor(editScene.strokeOpacity * 100)); },
	
	strokeSizeChanged: function(e,ui){
		editScene.strokeSize = ui.value; $('#stroke-size .ui-slider-handle').text(Math.floor(editScene.strokeSize));
	},
	
	strokeBrightnessChanged: function(e, ui){ editScene.strokeBrightness = ui.value * 0.01; $('#stroke-brightness .ui-slider-handle').text(Math.floor(editScene.strokeBrightness * 100)); },
		
	startStroke:function(){
		this.maskBox.material.opacity = 0.05;
		this.controls.panEnabled = this.controls.zoomEnabled = false;
		this.stroking = true;
		
		// create stroke set
		this.strokeSet = {};
		this.strokeOrigFrame = _.deepClone(this.doc.frames[this._currentFrame], 1);
		this.strokeMode = this._fillMode ? -1 : ((this.shift && this.alt) ? 3 : (this.shift ? 2 : (this.alt ? 1 : 0)));
		$('body').css('cursor', this.strokeMode == 3 ? 'crosshair' : 'cell');
		
		// place first pixel
		this.continueStroke();
	},

	continueStroke:function(){
		if(!this.intersectingMask) return;
		
		var intersectingPixels;
		var pixel = null;
		var numPix;
		
		// set up projection
		var screenPoint = new THREE.Vector3((this.mouseCoord.x / window.innerWidth ) * 2 - 1, -(this.mouseCoord.y / window.innerHeight ) * 2 + 1, 1.0);
		this.projector.unprojectVector(screenPoint, this.camera );
		this.raycaster.set(this.camera.position, screenPoint.sub(this.camera.position).normalize());
		this.raycaster.camRight = new THREE.Vector3(1,0,0);
		this.raycaster.camUp = new THREE.Vector3(0,1,0);
		this.raycaster.camRight.applyQuaternion(this.camera.quaternion);
		this.raycaster.camUp.applyQuaternion(this.camera.quaternion);

		var rayOffsets = this.brushSizeOffsets[this.strokeSize - 1];
		var numRays = rayOffsets.length;
		var rayOffset;
		var usedPixel = null;
		var tintColor = new THREE.Color();
		
		// ray
		var maxPix = numRays;
		for(var ri = 0; ri < numRays; ri++){
			rayOffset = rayOffsets[ri];
			pixel = null;
			intersectingPixels = this.getIntersectingPixels(rayOffset[0], rayOffset[1], this.strokeOrigFrame);
			if(this.strokeMode){
				// check for intersections with others
				// shift - only replace current pixels (during stroke turns visible off)
				numPix = intersectingPixels.length;
				for(var i = 0; i < numPix; i++){
					var iobj = intersectingPixels[i];
					if(this.strokeMode == 3){
						this.eyedropperFrom(iobj.object);
						return;
					} else if(this.strokeMode == -1) {// flood fill
						this.floodFill(iobj.object);
						return;
					}
					var candidate = { 
					 	x:Math.round(iobj.object.x), 
						y:Math.round(iobj.object.y), 
						z:Math.round(iobj.object.z)};
					if(	candidate.x >= this.maskPosition.x && candidate.x < (this.maskPosition.x + this.maskSize.x) && 
						candidate.y >= this.maskPosition.y && candidate.y < (this.maskPosition.y + this.maskSize.y) && 
						candidate.z >= this.maskPosition.z && candidate.z < (this.maskPosition.z + this.maskSize.z)){
						pixel = candidate;
						usedPixel = iobj.object;
						break;
					}
					break;
				}			
				// alt - deletes pixels
				if(this.strokeMode == 1 && pixel){
					pixel.subtract = true;
				}
			} else {
				// check for intersections with others
				numPix = intersectingPixels.length;
				for(var i = 0; i < numPix; i++){
					var iobj = intersectingPixels[i];
					var candidate = 
					{ 	x:Math.round(iobj.object.x + iobj.face.normal.x), 
						y:Math.round(iobj.object.y + iobj.face.normal.y), 
						z:Math.round(iobj.object.z + iobj.face.normal.z)};
					var existingPixel = this.strokeOrigFrame[candidate.x * this.doc.depth * this.doc.height + candidate.y * this.doc.depth + candidate.z];
					if(	candidate.x >= this.maskPosition.x && candidate.x < (this.maskPosition.x + this.maskSize.x) && 
						candidate.y >= this.maskPosition.y && candidate.y < (this.maskPosition.y + this.maskSize.y) && 
						candidate.z >= this.maskPosition.z && candidate.z < (this.maskPosition.z + this.maskSize.z) && 
						(!existingPixel || !existingPixel.a)){
						pixel = candidate;
						break;
					}
				}
				// if nothing is found, paint along the wall
				if(!pixel && this.intersectingMaskBack){
					pixel = {	x:Math.round(this.intersectingMaskBack.point.x - this.intersectingMaskBack.face.normal.x * 0.5), 
								y:Math.round(this.intersectingMaskBack.point.y - this.intersectingMaskBack.face.normal.y * 0.5), 
								z:Math.round(this.intersectingMaskBack.point.z - this.intersectingMaskBack.face.normal.z * 0.5)};
				}
				
				// don't replace existing in this mode
				if(pixel && this.strokeOrigFrame[pixel.x * this.doc.depth * this.doc.height + pixel.y * this.doc.depth + pixel.z]){
					pixel = null;
				}
			}
			
			// check if pixel is contiguious with others in set
			var sskeys = Object.keys(this.strokeSet);
			numPix = sskeys.length;
			if(this.checkContiguous && pixel && numPix){
				var contiguous = false;
				for(var i = 0; i < numPix; i++){
					var other = this.strokeSet[sskeys[i]];
					if(	Math.abs(other.x - pixel.x) <= 1.25 && 
						Math.abs(other.y - pixel.y) <= 1.25 &&
						Math.abs(other.z - pixel.z) <= 1.25) {
						
						contiguous = true;
						break;
					} 
				}
				if(!contiguous) pixel = null;
			}
			
			// add pixel to set
			if(pixel){
				var pixName = pixel.x + ',' + pixel.y + ',' + pixel.z;
				// if not already in set
				if(!this.strokeSet[pixName]){
					var addr = pixel.x * this.doc.depth * this.doc.height + pixel.y * this.doc.depth + pixel.z;
					// create pixel
					var p;
					if(editScene.paintAlpha == 1.0){
						p = this.makePixel(pixel.x, pixel.y, pixel.z, this.strokeColor, this.strokeOpacity, this.strokeBrightness);
						p.addr = addr;
						// if this pixel is replacing an existing pixel, temporarily hide it
						if(pixel.subtract) { 
							p.subtract = true;
							this.doc.frames[this._currentFrame][addr] = null;
						} else {
							this.doc.frames[this._currentFrame][addr] = p;
						}
					} else {
						// merge color
						if(usedPixel){
							tintColor.set(usedPixel.c);
							if(pixel.subtract){
								p = this.makePixel(pixel.x, pixel.y, pixel.z, tintColor, Math.max(0, usedPixel.a - this.paintAlpha), usedPixel.b);
								p.subtract = true;
							} else {
								tintColor.lerp(this.strokeColor, this.paintAlpha);
								p = this.makePixel(pixel.x, pixel.y, pixel.z, tintColor, 
									usedPixel.a + (this.strokeOpacity - usedPixel.a) * this.paintAlpha, 
									usedPixel.b + (this.strokeBrightness - usedPixel.b) * this.paintAlpha);
							}
						} else {
							p = this.makePixel(pixel.x, pixel.y, pixel.z, this.strokeColor, this.strokeOpacity * this.paintAlpha, this.strokeBrightness);
						}
						p.addr = addr;
						this.doc.frames[this._currentFrame][addr] = p;
					}
					// add to stroke
					this.strokeSet[pixName] = p;
				}
				maxPix--;
			}
			if(!maxPix) break;
		} // end ray
		
		this.model.replaceFramePartial(this.strokeSet, this._currentFrame);
	},

	finishStroke:function(){
		this.maskBox.material.opacity = 0.2;
		this.controls.panEnabled = this.controls.zoomEnabled = false;
		this.stroking = false;
		$('body').css('cursor','auto');

		// restore frame
		this.doc.frames[this._currentFrame] = this.strokeOrigFrame;
		this.strokeOrigFrame = null;

		// apply stroke set
		var newPixels = [];
		for(var pixName in this.strokeSet){
			var pixel = this.strokeSet[pixName];
			newPixels.push( [pixel.addr, pixel.subtract ? null : pixel] );
		}

		// merge into frame		
		if(newPixels.length){
			this.replacePixels(this._currentFrame, newPixels, true); // true to skip replacing pixels in model - already replaced
		}
		
		this.strokeSet = { };
	},	

	floodFill:function(startObj){
		// skip if already filled or if in strokeSet
		var pixName = startObj.x + ',' + startObj.y + ',' + startObj.z;
		if(this.strokeSet[pixName] || (startObj.c == this.strokeColor.getHex() && startObj.a == this.strokeOpacity && startObj.b == this.strokeBrightness)) return;

		// add starting obj		
		var stack = [ [startObj.x, startObj.y, startObj.z] ];
		var p, pos, neighbor;
		
		function getFloodPixel(x,y,z){
			if(x < 0 || x >= editScene.doc.width || y < 0 || y >= editScene.doc.height || z < 0 || z >= editScene.doc.depth || editScene.strokeSet[x+','+y+','+z]) return null;
			
			// shift down? limit to selection
			if(editScene.shift){
				if(x < editScene.maskPosition.x || x >= editScene.maskPosition.x + editScene.maskSize.x ||
				   y < editScene.maskPosition.y || y >= editScene.maskPosition.y + editScene.maskSize.y ||
				   z < editScene.maskPosition.z || z >= editScene.maskPosition.z + editScene.maskSize.z) return null;
			}
			
			var addr = x * editScene.doc.depth * editScene.doc.height + y * editScene.doc.depth + z;
			var obj = editScene.doc.frames[editScene._currentFrame][addr];
			if(!obj) return null;
			
			// not fillable color?
			if(obj.c != startObj.c || obj.a != startObj.a || obj.b != startObj.b) return null;
			
			// already filled? stop
			if(obj.c == editScene.strokeColor.getHex() && obj.a == editScene.strokeOpacity && obj.b == editScene.strokeBrightness) return null;
			
			
			return obj;
		}
		
		// flood fill
		while(stack.length){
			pos = stack.pop();
			// fill this pix
			p = this.makePixel(pos[0], pos[1], pos[2], this.strokeColor, this.strokeOpacity, this.strokeBrightness);
			p.addr = p.x * this.doc.depth * this.doc.height + p.y * this.doc.depth + p.z;
			this.doc.frames[this._currentFrame][p.addr] = p;
			this.strokeSet[p.x + ',' + p.y + ',' + p.z] = p;
						
			neighbor = getFloodPixel(p.x - 1, p.y, p.z);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }

			neighbor = getFloodPixel(p.x, p.y - 1, p.z);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }

			neighbor = getFloodPixel(p.x, p.y, p.z - 1);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }

			neighbor = getFloodPixel(p.x + 1, p.y, p.z);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }

			neighbor = getFloodPixel(p.x, p.y + 1, p.z);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }

			neighbor = getFloodPixel(p.x, p.y, p.z + 1);
			if(neighbor){ stack.push([neighbor.x, neighbor.y, neighbor.z]); }
		}
		
		// end		
		this.model.replaceFramePartial(this.strokeSet, this._currentFrame);
	},

	fillBox:function(e, forceClear){
		if(editScene.pasteMode) editScene.cancelPaste();
		var clear = false;
		if(e){
			if(e.target.id == 'edit-clear') clear = true;
		} else {
			clear = forceClear;
		}
		var pixels = [];
		var tint = new THREE.Color();
		var ww = Math.min(this.doc.width, this.maskPosition.x + this.maskSize.x);
		var hh = Math.min(this.doc.height, this.maskPosition.y + this.maskSize.y);
		var dd = Math.min(this.doc.depth, this.maskPosition.z + this.maskSize.z);
		for(var x = this.maskPosition.x; x < ww; x++){
		for(var y = this.maskPosition.y; y < hh; y++){
		for(var z = this.maskPosition.z; z < dd; z++){
			var src = this.doc.frames[this._currentFrame][x * this.doc.depth * this.doc.height + y * this.doc.depth + z];
			if(this.shift){
				if(!src) src = { c: this.strokeColor.getHex(), a:0, b:0 };
				tint.set(src.c);
				if(clear){
					pixels.push([x * this.doc.depth * this.doc.height + y * this.doc.depth + z,
									this.makePixel(x,y,z, tint,
									src.a - src.a * this.paintAlpha,
									src.b - src.b * this.paintAlpha)
									]);
				} else {
					tint.lerp(this.strokeColor, this.paintAlpha);
					pixels.push([x * this.doc.depth * this.doc.height + y * this.doc.depth + z,
									this.makePixel(x,y,z, tint, 
									src.a + (this.strokeOpacity - src.a) * this.paintAlpha,
									src.b + (this.strokeBrightness - src.b) * this.paintAlpha)
									]);
				}
			} else {
				pixels.push([x * this.doc.depth * this.doc.height + y * this.doc.depth + z,
							clear ? null : this.makePixel(x,y,z, this.strokeColor, this.strokeOpacity, this.strokeBrightness)
							]);
			}
		}}}
		this.replacePixels(this._currentFrame, pixels);
	},

	fillBall:function(e){
		if(editScene.pasteMode) editScene.cancelPaste();
		var pixels = [];
		// center
		var cx = this.maskPosition.x + this.maskSize.x * 0.5;
		var cy = this.maskPosition.y + this.maskSize.y * 0.5;
		var cz = this.maskPosition.z + this.maskSize.z * 0.5;

		// far position
		var ww = Math.min(this.doc.width, this.maskPosition.x + this.maskSize.x);
		var hh = Math.min(this.doc.height, this.maskPosition.y + this.maskSize.y);
		var dd = Math.min(this.doc.depth, this.maskPosition.z + this.maskSize.z);
		// radius
		var rx = this.maskSize.x * 0.5,
			ry = this.maskSize.y * 0.5,
			rz = this.maskSize.z * 0.5;
		var r, dx, dy, dz;
		var tint = this.strokeColor.clone();
		for(var x = this.maskPosition.x; x < ww; x++){
		for(var y = this.maskPosition.y; y < hh; y++){
		for(var z = this.maskPosition.z; z < dd; z++){
			dx = Math.abs(x - cx);
			dy = Math.abs(y - cy);
			dz = Math.abs(z - cz);			
			r = Math.pow(dx, 2) / Math.pow(rx, 2) +
				Math.pow(dy, 2) / Math.pow(ry, 2) +
				Math.pow(dz, 2) / Math.pow(rz, 2);
			if(r < 1){//fff265
				var src = this.doc.frames[this._currentFrame][x * this.doc.depth * this.doc.height + y * this.doc.depth + z];
				if(this.shift){
					if(!src) src = { c: this.strokeColor.getHex(), a:0, b:this.strokeBrightness };
					tint.set(src.c);
					tint.lerp(this.strokeColor, this.paintAlpha);
					pixels.push([x * this.doc.depth * this.doc.height + y * this.doc.depth + z,
									this.makePixel(x,y,z, tint, 
									src.a + (this.strokeOpacity - src.a) * this.paintAlpha,
									src.b + (this.strokeBrightness - src.b) * this.paintAlpha)
									]);
				} else {
					pixels.push([x * this.doc.depth * this.doc.height + y * this.doc.depth + z,
									this.makePixel(x,y,z, this.strokeColor, 
									this.strokeOpacity,
									this.strokeBrightness)
									]);
				}
			}
		}}}
		this.replacePixels(this._currentFrame, pixels);
	},

	makePixel:function(x, y, z, color, opacity, brightness) {
		return { x:x, y:y, z:z, c:color.getHex(), a:opacity, b: brightness };
	},
	
	/* pixels are in format [ [loc, pixel], [loc, pixel] ... ] */
	replacePixels:function(frameIndex, pixels, noFrameReplace){
		// prepare undo with previous contents
		var prevPixels = [];
		
		// and replace pixels
		var frame = this.doc.frames[frameIndex];
		for(var i = 0; i < pixels.length; i++){
			var p = pixels[i];
			prevPixels.push([p[0], (frame[p[0]] ? frame[p[0]] : null)]);
			frame[p[0]] = p[1];			
		}
				
		// store undo
		this.addUndo({ undo: [this.replacePixels, frameIndex, prevPixels], redo: [this.replacePixels, frameIndex, pixels] });
		
		if(frameIndex != this._currentFrame){
			this.currentFrame = frameIndex;
		}
		
		// refresh model
		if(!noFrameReplace) this.model.replaceFrame(this.doc.frames[frameIndex], frameIndex);
		
		this.frameContentsChanged(frameIndex);
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Mouse handling */
	
	mouseDown:function(e){
		// ignore right button
		if(e.button === 2 || this.playing || !this.canvasInteractionsEnabled) return;
		
		// blur input boxes
		if(e.target.nodeName.toLowerCase()=='canvas') editScene.blur();

		this.lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
		if(this._pasteMode && this.intersectingPaste && !this.ctrl){
			this.startPasteMove();
		} else if(this.canStroke) { 
			this.startStroke();
		} else if(this.movingMaskEnabled && this.intersectingMask){
			this.startMaskMove();
		}
	},

	mouseUp:function(e){
		if(this.stroking){
			this.finishStroke();
		} else if(this.movingMask){
			this.finishMaskMove();
		} else if(this.movingPaste){
			this.finishPasteMove();
		} 
		
		if(this.disableCanvasInteractionsOnRelease){
			this.disableCanvasInteractions();
			this.disableCanvasInteractionsOnRelease = false;
		}
		
		// hide opened menus
		$('.submenu').hide();
		
		if(window.editorHidden){
			window.editorHidden = false;
			$('.editor.ui-widget-header').show();
		}
	},

	mouseMove:function(e){
		this.mouseCoord = { x: e.pageX, y: e.pageY };

		// trace ray to determine if mouse is over model
		var screenPoint = new THREE.Vector3((this.mouseCoord.x / window.innerWidth ) * 2 - 1, -(this.mouseCoord.y / window.innerHeight ) * 2 + 1, 1.0);
		this.projector.unprojectVector(screenPoint, this.camera );
		this.raycaster.set(this.camera.position, screenPoint.sub(this.camera.position).normalize());

		// mask intersection
		if(this._pasteMode){
			this.intersectingPaste = this.raycaster.intersectObject(this.paste, false);
			this.intersectingPaste = this.intersectingPaste.length ? this.intersectingPaste[0] : null;
			this.intersectingMask = null;
		} else {
			this.intersectingMask = this.raycaster.intersectObject(this.maskBox, false);
			this.intersectingMask = this.intersectingMask.length ? this.intersectingMask[0] : null;
			this.intersectingPaste = null;
		}
		
		this.canStroke = !this.ctrl && !this.playing && !this.movingMaskEnabled && !this.movingMask && (this.intersectingMask);
		
		if(this.stroking){
			var lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
			var dist = this.lazyMouse.distanceToSquared(lazyMouse);
			if(dist > 5){
				this.lazyMouse = lazyMouse;
				this.continueStroke();
			}
			
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(this.movingMask){
			this.continueMaskMove();
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(this.movingPaste){
			this.continuePasteMove();
			if(!window.editorHidden){
				window.editorHidden = true;
				$('.editor.ui-widget-header').hide();
			}
		} else if(!(this.controls.busy())) { 
			this.controls.panEnabled = this.controls.zoomEnabled = !(this.movingMask || this.movingMaskEnabled);
			this.controls.rotateEnabled = (!this.intersectingPaste || this.ctrl) && !this.canStroke && this.controls.zoomEnabled;
		}
	},

	/* returns objects represeting intersecting pixels */
	getIntersectingPixels:function(offsetX, offsetY, frameObject){
		var offX = this.raycaster.camRight.clone();
		var offY = this.raycaster.camUp.clone();
		offX.multiplyScalar(offsetX);
		offY.multiplyScalar(offsetY);
		this.raycaster.ray.origin.copy(this.camera.position).add(offX).add(offY);
	
		// intersect ray with boundary
		var sz = new THREE.Vector3(this.doc.width, this.doc.height, this.doc.depth);
		this.maskBox.material.side = THREE.FrontSide;
		this.maskBox.position.copy(sz).multiplyScalar(0.5);
		this.maskBox.scale.copy(sz);
		this.maskBox.updateMatrixWorld(true);
		var inter = this.raycaster.intersectObject(this.maskBox);
		this.maskBox.material.side = THREE.BackSide;
		this.updateMaskBox();
		this.maskBox.updateMatrixWorld(true);

		// backwall
		this.intersectingMaskBack = this.raycaster.intersectObject(this.maskBox)[0];

		// return if empty
		if(!inter.length) return [];
		inter = inter[0];
	
		// we now have entry point
		var x = inter.point.x;
		var y = inter.point.y;
		var z = inter.point.z;

		var stepSize = 0.25;
		var sx = (this.raycaster.ray.direction.x) * stepSize;
		var sy = (this.raycaster.ray.direction.y) * stepSize;
		var sz = (this.raycaster.ray.direction.z) * stepSize;
			
		var pixels = [];
		var xx,yy,zz;
		var prevAddr, addr;
		var p;
		var cpy;
		
		var steps = 0;
		var longestDim = Math.max(this.doc.width, this.doc.height, this.doc.depth);
		var maxSteps = Math.sqrt(2 * longestDim * longestDim) / stepSize;
		var maxDepth = 5;
		
		var DEBUG_STROKE = false;
		
		if(DEBUG_STROKE){
			if(this.debugs){
				for(var i = 0; i < this.debugs.length; i++){
					this.scene.remove(this.debugs[i]);
				}
				this.debugs.length = 0;
			} else {
				this.debugs = [];
			}
		}
		
		while(steps < maxSteps && x >= 0 && x <= this.doc.width && y >= 0 && y <= this.doc.height && z >= 0 && z <= this.doc.depth){
			xx = Math.round(x);yy = Math.round(y);zz = Math.round(z);
			if(xx < this.doc.width && yy < this.doc.height && zz < this.doc.depth) {
				addr = xx * (this.doc.depth * this.doc.height) + (yy * this.doc.depth) + zz;
				if(addr !== prevAddr){
					p = frameObject[addr];
					if(DEBUG_STROKE){
						var m = new THREE.MeshBasicMaterial({wireframe:true});
						var g = new THREE.BoxGeometry(1,1,1);
						var d = new THREE.Mesh(g, m);
						d.position.set(xx,yy,zz);
						this.debugs.push(d);
						this.scene.add(d);
						
						var lg = new THREE.Geometry();
						lg.vertices.push(
							new THREE.Vector3( x, y, z ),
							new THREE.Vector3( x + sx, y + sy, z + sz )
						);
						
						var line = new THREE.Line( lg, new THREE.LineBasicMaterial({ color: (steps % 2) ? 0xffffff : 0x999999 }) );
						this.debugs.push(line);
						this.scene.add(line);
						
					}
					if(p && p.a) { 
						this.intersectionTestBox.position.set(xx,yy,zz);//(xx + 0.5, yy + 0.5, zz + 0.5);
						this.intersectionTestBox.updateMatrixWorld(true);
						inter = this.raycaster.intersectObject(this.intersectionTestBox, false);
						if(inter.length){
							inter[0].object = p;
							pixels.push(inter[0]);
							
							if(DEBUG_STROKE) m.color.set(0x00FF00);
							if(pixels.length >= maxDepth) break;
						} else if(DEBUG_STROKE){
							m.color.set(0xFF0000);
						}
					} else if(DEBUG_STROKE){
						m.color.set(0x0);
					}
				}
				
				prevAddr = addr;
			}
			
			x += sx; y += sy; z += sz;
			steps++;
		}
		
		return pixels;
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Selection */

	startPasteMove:function(){
		this.movingPaste = this.paste;		
		
		// store original mask dimensions
		this.origPastePosition = this.paste.position.clone();
		
		// create drag plane
		this.dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(500,500,4,4), new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true, side: THREE.DoubleSide }));
		this.scene.add(this.dragPlane);
		this.dragPlane.visible = false;
		
		// orient it according to moving or resizing mode
		this.dragPlane.rotation.copy(this.camera.rotation);
		this.dragPlane.position.copy(this.intersectingPaste.point);
		this.dragUpVector = new THREE.Vector3(0,1,0);
		this.dragRightVector = new THREE.Vector3(1,0,0);
		this.dragPlane.updateMatrixWorld(true);
		var normalMatrix = new THREE.Matrix3().getNormalMatrix( this.dragPlane.matrixWorld );
		this.dragUpVector.applyMatrix3(normalMatrix).normalize();
		this.dragRightVector.applyMatrix3(normalMatrix).normalize();
		$('body').css('cursor', 'move');
			
		this.startDragPaste = this.raycaster.intersectObject(this.dragPlane);
		if(!this.startDragPaste.length) {
			this.finishPasteMove();
			return;
		}
		// store drag offset
		this.startDragPaste = this.startDragPaste[0].point.round();
		this.dragPlane.worldToLocal(this.startDragPaste);	
	},

	continuePasteMove:function(){
		// get new position
		var offs = this.raycaster.intersectObject(this.dragPlane);
		if(!offs.length) return;
		
		// convert to drag plane space
		offs = offs[0].point;
		this.dragPlane.worldToLocal(offs);
		
		// compute offset from start drag
		var oy = Math.round(this.startDragPaste.y - offs.y);
		var ox = Math.round(this.startDragPaste.x - offs.x);

			// move whole box
		var pos = 
		this.origPastePosition.clone()
			.add(this.dragUpVector.clone().multiplyScalar(-oy))
			.add(this.dragRightVector.clone().multiplyScalar(-ox));
		
		pos.round();

		this.paste.position.copy(pos);
	},
	
	finishPasteMove:function(){
		// restore color and clear dragged object
		this.movingPaste = null;
		
		// remove drag plane
		if(this.dragPlane){
			this.scene.remove(this.dragPlane);
			this.dragPlane = null;
		}
		$('body').css('cursor', 'auto');
		
		this.updatePasteSpinnersFromPaste();
	},

	completePaste:function(){
		if(!this._pasteMode) return;
		
		if(this.autoStorePastePos) this.storePasteValues();
		
		var pixels = [];
		var existingPixel, pixel;
		var emptyObj = { c:0, a:0, b: 0};
		var pos = new THREE.Vector3();
		var ps = new THREE.Vector3(this.paste.geometry.data.width, this.paste.geometry.data.height, this.paste.geometry.data.depth);
		var halfSize = new THREE.Vector3(ps.x * 0.5,ps.y * 0.5,ps.z * 0.5);
		halfSize.floor();
		
		// object / paste
		var addrset = {};
		for(var x = 0; x < this.doc.width; x++){
		for(var y = 0; y < this.doc.height; y++){
		for(var z = 0; z < this.doc.depth; z++){
			addr = x * this.doc.depth * this.doc.height + y * this.doc.depth + z;
			existingPixel = this.doc.frames[this._currentFrame][addr];
			if(!existingPixel) existingPixel = emptyObj;
			
			pos.set(x,y,z);
			this.paste.worldToLocal(pos);
			pos.add(halfSize);
			pos.floor();
			
			if(pos.x >= 0 && pos.x < ps.x && pos.y >= 0 && pos.y < ps.y && pos.z >= 0 && pos.z < ps.z){
				pixel = this.pasteObject[pos.x * ps.z * ps.y + pos.y * ps.z + pos.z];
				if(pixel && pixel.a > 0 && (pixel.c != existingPixel.c || pixel.a != existingPixel.a || pixel.b != existingPixel.b)){
					pixel = _.deepClone(pixel);
					pixel.x = x; pixel.y = y; pixel.z = z;
					pixels.push([addr, pixel]);
					addrset[addr] = pixel;
				}
			}
		}}}
		
		var needsDouble = this.shift || (this.paste.scale.x > 1.0 || this.paste.scale.y > 1.0 || this.paste.scale.z > 1.0);//|| (this.paste.rotation.x % (Math.PI/2) || this.paste.rotation.y % (Math.PI/2) || this.paste.rotation.z % (Math.PI/2));

		if(needsDouble){
			console.log('double paste');			
			// paste / object
			for(var x = 0; x < ps.x; x++){
			for(var y = 0; y < ps.y; y++){
			for(var z = 0; z < ps.z; z++){
				addr = x * ps.z * ps.y + y * ps.z + z;
				pixel = this.pasteObject[addr];
				if(!pixel || pixel.a == 0.0) continue;
				
				pos.set(x,y,z);
				pos.sub(halfSize);
				this.paste.localToWorld(pos);
				pos.floor();
				
				if(pos.x >= 0 && pos.x < this.doc.width && pos.y >= 0 && pos.y < this.doc.height && pos.z >= 0 && pos.z < this.doc.depth){
					addr = pos.x * this.doc.depth * this.doc.height + pos.y * this.doc.depth + pos.z;
					existingPixel = this.doc.frames[this._currentFrame][addr];
					if(addrset[addr]) continue; // already placed
					if(!existingPixel) existingPixel = emptyObj;
					if(pixel.c != existingPixel.c || pixel.a != existingPixel.a || pixel.b != existingPixel.b){
						pixel = _.deepClone(pixel);
						pixel.x = pos.x; pixel.y = pos.y; pixel.z = pos.z;
						pixels.push([addr, pixel]);
					}
				}
			}}}
		}
		
		if(pixels.length) this.replacePixels(this._currentFrame, pixels);
		
		this.pasteMode = false;	
	},

	cancelPaste:function(){
		if(this.playing) this.stop(); // side effect for hitting Esc when playing
		if(!this._pasteMode) return;
		

		this.pasteMode = false;	
	},	

	copySelection:function(){
		console.log(this.shift);		
		if(this._pasteMode) return;
		
		var copyObject = { 
			x: this.maskPosition.x,
			y: this.maskPosition.y,
			z: this.maskPosition.z,
			width: this.maskSize.x,
			height: this.maskSize.y,
			depth: this.maskSize.z,
			frames: [ [] ] };
		
		var addr;
		for(var x = this.maskPosition.x; x < this.maskPosition.x + this.maskSize.x; x++){
		for(var y = this.maskPosition.y; y < this.maskPosition.y + this.maskSize.y; y++){
		for(var z = this.maskPosition.z; z < this.maskPosition.z + this.maskSize.z; z++){
			addr = x * this.doc.depth * this.doc.height + y * this.doc.depth + z;
			var p = this.doc.frames[this._currentFrame][addr];
			if(p){
				p = _.deepClone(p);
				delete p.x; delete p.y; delete p.z;
			}
			copyObject.frames[0].push(p);			
		}}};		
				
		var sf = JSON.stringify(copyObject);
		
		console.log("Copied (" + sf.length + " chars)", copyObject);
		localStorage.setItem('clipboard', sf);
	},

	cutSelection:function(){
		if(this._pasteMode) return;
		
		this.copySelection();
		this.fillBox(null, true);
	},

	pasteSelection:function(){
		editScene.blur();
		if(this._pasteMode) this.completePaste();
		
		var pasteItem = localStorage.getItem('clipboard');
		if(!pasteItem) return;
		try {
			pasteItem = JSON.parse(pasteItem);
		} catch(e){
			return;
		}
		
		this.paste = new THREE.PixelBox({
			width: pasteItem.width, height: pasteItem.height, depth: pasteItem.depth, 
			smoothNormals: this.doc.smoothNormals, occlusion: this.doc.occlusion, optimize: this.doc.optimize,
			offset: true,
			frames: null
		});
		this.paste.material.uniforms.cullBack.value = 0;
		this.paste.stipple = 2;
		this.paste.addFrameAt(0);
		this.paste.replaceFrame(pasteItem.frames[0],0);
		this.paste.frame = 0;
		this.paste.geometry.computeBoundingBox();
		this.paste.position.set(pasteItem.x + Math.round(pasteItem.width * 0.5),
								pasteItem.y + Math.round(pasteItem.height * 0.5),
								pasteItem.z + Math.round(pasteItem.depth * 0.5));
		this.paste.origPos = this.paste.position.clone();
		this.scene.add(this.paste);
		
		this.pasteMode = true;
		
		this.pasteObject = pasteItem.frames[0];

		if(this.autoStorePastePos) this.restorePasteValues();
	},
	
	set pasteMode(pm){
		if(pm != this._pasteMode){
			this._pasteMode = pm;
			this.maskBox.visible = !pm;
			// enter paste mode
			if(pm){
				this.model.stipple = 1;
				
				this.hiddenUI = $('#editor-toolbar,#editor-mask,#editor-stroke,#editor-lights,#editor-preview,#editor-anims,#editor-anchors').detach();
				this.pasteUI.appendTo('body');
				
				this.updatePasteSpinnersFromPaste();
			// exit paste mode
			} else {
				this.model.stipple = 0;
				
				this.hiddenUI.appendTo('body');
				this.pasteUI.detach();
				
				// destroy pasted object visual
				if(this.paste){
					this.paste.dispose();
					this.scene.remove(this.paste);
					delete this.paste;
				}
				
				delete this.pasteObject;
				this.intersectingPaste = null;
			}
		}	
	},
	
	get pasteMode(){
		return this._pasteMode;
	},
	
	updatePasteSpinnersFromPaste:function(){
		if(editScene.pasteSpinnersUpdatesDisabled) return;
		
		editScene.pasteSpinnersUpdatesDisabled = true;
		
		$('#paste-x').spinner('value', this.paste.position.x);
		$('#paste-y').spinner('value', this.paste.position.y);
		$('#paste-z').spinner('value', this.paste.position.z);
		$('#paste-rx').spinner('value', Math.round(180 * this.paste.rotation.x / Math.PI));
		$('#paste-ry').spinner('value', Math.round(180 * this.paste.rotation.y / Math.PI));
		$('#paste-rz').spinner('value', Math.round(180 * this.paste.rotation.z / Math.PI));
		$('#paste-sx').spinner('value', fake0(this.paste.scale.x));
		$('#paste-sy').spinner('value', fake0(this.paste.scale.y));
		$('#paste-sz').spinner('value', fake0(this.paste.scale.z));
		
		editScene.pasteSpinnersUpdatesDisabled = false;
	},
	
	pasteSpinnerChange: function(e){
		var targ = e ? $(e.target).attr('id') : null;
		
		switch(targ){
		case 'paste-x':
			editScene.paste.position.x = notNaN($('#'+targ).spinner('value'));
			break;
		case 'paste-y':
			editScene.paste.position.y = notNaN($('#'+targ).spinner('value'));
			break;
		case 'paste-z':
			editScene.paste.position.z = notNaN($('#'+targ).spinner('value'));
			break;
		case 'paste-sx':
			editScene.paste.scale.x = not0($('#'+targ).spinner('value'));
			break;
		case 'paste-sy':
			editScene.paste.scale.y = not0($('#'+targ).spinner('value'));
			break;
		case 'paste-sz':
			editScene.paste.scale.z = not0($('#'+targ).spinner('value'));
			break;
		case 'paste-rx':
			editScene.paste.rotation.x = Math.PI * notNaN($('#'+targ).spinner('value')) / 180.0;
			break;
		case 'paste-ry':
			editScene.paste.rotation.y = Math.PI * notNaN($('#'+targ).spinner('value')) / 180.0;
			break;
		case 'paste-rz':
			editScene.paste.rotation.z = Math.PI * notNaN($('#'+targ).spinner('value')) / 180.0;
			break;			
		}
	},
	
	pasteFlip: function(e){
		var targ = e ? $(e.currentTarget).attr('id') : null;
		switch(targ){
		case 'paste-flip-x':
			editScene.paste.scale.x *= -1;
			break;
		case 'paste-flip-y':
			editScene.paste.scale.y *= -1;
			break;
		case 'paste-flip-z':
			editScene.paste.scale.z *= -1;
			break;
		}
		editScene.updatePasteSpinnersFromPaste();
	},
	
	storePasteValues: function(){
		editScene.pasteValues = {p: editScene.paste.position.clone(), r: editScene.paste.rotation.clone(), s: editScene.paste.scale.clone()};
		$('#paste-restore').removeAttr('disabled');
	},

	restorePasteValues: function(){
		if(!editScene.pasteValues) return;
		editScene.paste.position.copy(editScene.pasteValues.p);
		editScene.paste.scale.copy(editScene.pasteValues.s);
		editScene.paste.rotation.copy(editScene.pasteValues.r);
		editScene.updatePasteSpinnersFromPaste();
	},

	resetPasteValues: function(){
		editScene.paste.scale.set(1,1,1);
		editScene.paste.rotation.set(0,0,0,'XYZ');
		editScene.paste.position.copy(editScene.paste.origPos);		
		editScene.updatePasteSpinnersFromPaste();
	},

	autoStorePastePosChanged: function(){
		this.autoStorePastePos = $('#paste-autostore').get(0).checked;
		localStorage.setItem('autoStorePastePos', this.autoStorePastePos);
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Masking */

	/* move mask, or paste item in camera-aligned coord sys */
	moveTool:function(dx,dy){
		// find which plane the camera is aligned with
		var camVector = new THREE.Vector3(0,0, -1);
		var camUp = new THREE.Vector3(0,1,0);
		camVector.applyQuaternion(this.camera.quaternion);
		camUp.applyQuaternion(this.camera.quaternion);

		var planes = [
			new THREE.Vector3(1,0,0),
			new THREE.Vector3(-1,0,0),
			new THREE.Vector3(0,1,0),
			new THREE.Vector3(0,-1,0),
			new THREE.Vector3(0,0,1),
			new THREE.Vector3(0,0,-1) ];

		var minDot = 1, minDotIndex = -1, dot;
		for(var i = 0; i < 6; i++){
			dot = camVector.dot(planes[i]);
			if(dot < minDot){ minDot = dot; minDotIndex = i; }
		}
		
		// additional dots for up/down positions
		var xdot = planes[0].dot(camUp);
		var zdot = planes[4].dot(camUp);
		
		var xdir = new THREE.Vector3(), ydir = new THREE.Vector3();
		switch(minDotIndex){
		case 0: xdir.set(0,0,-1); ydir.set(0,1,0); break;
		case 1: xdir.set(0,0,1); ydir.set(0,1,0); break;
		case 4: xdir.set(1,0,0); ydir.set(0,1,0); break;
		case 5: xdir.set(-1,0,0); ydir.set(0,1,0); break;
		case 2:
			if(Math.abs(zdot) > Math.abs(xdot)){
				if(zdot < 0){
					xdir.set(1,0,0); ydir.set(0,0,-1);
				} else {
					xdir.set(-1,0,0); ydir.set(0,0,1);
				}
			} else {
				if(xdot < 0){
					xdir.set(0,0,-1); ydir.set(-1,0,0);
				} else {
					xdir.set(0,0,1); ydir.set(1,0,0);
				}
			}
			break;
		case 3:
			if(Math.abs(zdot) > Math.abs(xdot)){
				if(zdot < 0){
					xdir.set(-1,0,0); ydir.set(0,0,-1);
				} else {
					xdir.set(1,0,0); ydir.set(0,0,1);
				}
			} else {
				if(xdot < 0){
					xdir.set(0,0,1); ydir.set(-1,0,0);
				} else {
					xdir.set(0,0,-1); ydir.set(1,0,0);
				}
			}
			break;
		}
		
		xdir.multiplyScalar(dx);
		ydir.multiplyScalar(dy);
		var posInc = xdir.clone().add(ydir);
		var selectedAnchor = $('#anchor-list div.selected');
		var anchor = selectedAnchor.length ? this.doc.frames[this._currentFrame].anchors[parseInt(selectedAnchor.attr('id').substr(11))] : null;

		if(this._pasteMode){
			this.paste.position.add(posInc);
			this.updatePasteSpinnersFromPaste();			
		} else if(anchor && anchor.on){
			var updatedAnchor = _.deepClone(anchor);
			var anchorIndex = parseInt(selectedAnchor.attr('id').substr(11));
			
			updatedAnchor.x += posInc.x; updatedAnchor.y += posInc.y; updatedAnchor.z += posInc.z;
			
			// replace last undo's redo if moving the same anchor
			var lastUndo = this._undo.length ? this._undo[this._undo.length - 1] : null;
			if(lastUndo && lastUndo.name == 'Move Anchor' && lastUndo.undo[1] == this._currentFrame && lastUndo.undo[2] == anchorIndex){
				lastUndo.redo[3] = updatedAnchor;
			} else lastUndo = null;
			
			if(!lastUndo){
				this.addUndo({name:'Move Anchor', 	undo:[this.updateAnchor, this._currentFrame, anchorIndex, anchor],
													redo:[this.updateAnchor, this._currentFrame, anchorIndex, updatedAnchor]});
			}
			
			this.doc.frames[this._currentFrame].anchors[anchorIndex] = updatedAnchor;
			$('#anchor-row-'+anchorIndex).trigger('click');// refresh numbers
			
		} else {
			this.maskPosition.add(posInc);
			this.maskPosition.x = Math.max(0, Math.min(this.doc.width - this.maskSize.x, this.maskPosition.x));
			this.maskPosition.y = Math.max(0, Math.min(this.doc.height - this.maskSize.y, this.maskPosition.y));
			this.maskPosition.z = Math.max(0, Math.min(this.doc.depth - this.maskSize.z, this.maskPosition.z));
			this.updateMaskBox();
			this.updateMaskSizeSpinnersFromMask();
		}
	},
	
	startMaskMove:function(){
		// get which handle we're about to drag
		this.movingMask = this.raycaster.intersectObjects(this.maskBox.children, false);
		if(!this.movingMask.length) {
			this.movingMask = null;
			this.finishMaskMove();
			return;
		}
		
		this.movingMask = this.movingMask[0];
		
		// store original mask dimensions
		this.origMaskPosition = this.maskPosition.clone();
		this.origMaskSize = this.maskSize.clone();
		
		// create drag plane
		this.dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(300,300,4,4), new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true, side: THREE.DoubleSide }));
		this.scene.add(this.dragPlane);
		this.dragPlane.visible = false;
		
		// orient it according to moving or resizing mode
		if(this.maskingSizingMode || editScene.maskingMode != 'xyz'){
			this.dragPlane.rotation.copy(this.camera.rotation);
			this.dragPlane.position.copy(this.movingMask.point);
			this.dragUpVector = new THREE.Vector3(0,1,0);
			this.dragRightVector = new THREE.Vector3(1,0,0);
			this.dragPlane.updateMatrixWorld(true);
			var normalMatrix = new THREE.Matrix3().getNormalMatrix( this.dragPlane.matrixWorld );
			this.dragUpVector.applyMatrix3(normalMatrix).normalize();
			this.dragRightVector.applyMatrix3(normalMatrix).normalize();
			console.log(this.dragUpVector);
			$('body').css('cursor', 'move');
		} else {
			this.dragPlane.rotation.copy(this.movingMask.object.rotation);
			this.dragPlane.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI * 0.5);
			this.movingMask.object.material.color.set(0xFF6600);
			this.movingMask.object.localToWorld(this.dragPlane.position);
			this.dragPlane.updateMatrixWorld(true);
			$('body').css('cursor', 'crosshair');
		}
		this.startDragMask = this.raycaster.intersectObject(this.dragPlane);
		if(!this.startDragMask.length) {
			this.finishMaskMove();
			return;
		}
		// store drag offset
		this.startDragMask = this.startDragMask[0].point.round();
		this.dragPlane.worldToLocal(this.startDragMask);	
		
		this.model.stipple = 1;
	},

	continueMaskMove:function(){
		// get new position
		var offs = this.raycaster.intersectObject(this.dragPlane);
		if(!offs.length) return;
		
		// convert to drag plane space
		offs = offs[0].point;
		this.dragPlane.worldToLocal(offs);
		
		// compute offset from start drag
		var oy = Math.round(this.startDragMask.y - offs.y);
		var ox = Math.round(this.startDragMask.x - offs.x);

		if(this.maskingSizingMode || editScene.maskingMode != 'xyz'){
			// move whole box
			this.maskPosition.copy(this.origMaskPosition)
				.add(this.dragUpVector.clone().multiplyScalar(-oy))
				.add(this.dragRightVector.clone().multiplyScalar(-ox));
		} else {
			// move appropriate boundary
			switch(this.movingMask.object.name){
			case 'e':
				this.maskSize.y = Math.min(this.doc.height, Math.max(1, this.origMaskSize.y - oy));
				break;
			case 'f':
				this.maskPosition.y = Math.min(this.doc.height - 1, Math.max(0, this.origMaskPosition.y + oy));
				this.maskSize.y = Math.max(1, Math.min(this.doc.height, this.origMaskSize.y - oy));
				break;
			case 'a':
				this.maskSize.z = Math.min(this.doc.depth, Math.max(1, this.origMaskSize.z - oy));
				break;
			case 'b':
				this.maskPosition.z = Math.min(this.doc.depth - 1, Math.max(0, this.origMaskPosition.z + oy));
				this.maskSize.z = Math.max(1, Math.min(this.doc.depth, this.origMaskSize.z - oy));
				break;
			case 'c':
				this.maskSize.x = Math.min(this.doc.width, Math.max(1, this.origMaskSize.x - oy));
				break;
			case 'd':
				this.maskPosition.x = Math.min(this.doc.width - 1, Math.max(0, this.origMaskPosition.x + oy));
				this.maskSize.x = Math.max(1, Math.min(this.doc.width, this.origMaskSize.x - oy));
				break;
			}
		}
		this.maskPosition.round();
		this.maskSize.round();

		this.maskPosition.x = Math.max(0, Math.min(this.doc.width - this.maskSize.x, this.maskPosition.x));
		this.maskPosition.y = Math.max(0, Math.min(this.doc.height - this.maskSize.y, this.maskPosition.y));
		this.maskPosition.z = Math.max(0, Math.min(this.doc.depth - this.maskSize.z, this.maskPosition.z));

		this.maskSize.x = Math.max(1, Math.min(this.doc.width - this.maskPosition.x, this.maskSize.x));
		this.maskSize.y = Math.max(1, Math.min(this.doc.height - this.maskPosition.y, this.maskSize.y));
		this.maskSize.z = Math.max(1, Math.min(this.doc.depth - this.maskPosition.z, this.maskSize.z));

		// update visuals
		this.updateMaskBox();
		this.updateMaskSizeSpinnersFromMask();
	},
	
	finishMaskMove:function(){
		// restore color and clear dragged object
		if(this.movingMask) this.movingMask.object.material.color.set(0xFFFFFF);
		this.movingMask = null;
		this.enableMaskControls(this.movingMaskEnabled, true);
		// remove drag plane
		if(this.dragPlane){
			this.scene.remove(this.dragPlane);
			this.dragPlane = null;
		}
		this.model.stipple = 0;
		$('body').css('cursor', 'auto');
	},

	updateMaskBox:function(){
		if(!this.maskBox) {
			var geom = new THREE.BoxGeometry(1,1,1);
			geom.computeBoundingSphere();
			geom.computeBoundingBox();

			// add selection mask
			var mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.2 });
			mat.side = THREE.BackSide;
			this.maskBox = new THREE.Mesh(geom, mat);
			this.container.add(this.maskBox);
			
			// create drag handles
			this.maskHandles = [];
			var handle;
			geom = new THREE.PlaneGeometry(1,1,1);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(0,0,0.5);
			handle.visible = false;
			handle.name = 'a';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(0,0,-0.5);
			handle.rotation.y = Math.PI;
			handle.visible = false;
			handle.name = 'b';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(0.5,0,0);
			handle.rotation.y = Math.PI * 0.5;
			handle.visible = false;
			handle.name = 'c';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(-0.5,0,0);
			handle.rotation.y = -Math.PI * 0.5;
			handle.visible = false;
			handle.name = 'd';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(0,0.5,0);
			handle.rotation.x = -Math.PI * 0.5;
			handle.visible = false;
			handle.name = 'e';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);
			mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
			handle = new THREE.Mesh(geom, mat);
			handle.position.set(0,-0.5,0);
			handle.rotation.x = Math.PI * 0.5;
			handle.visible = false;
			handle.name = 'f';
			this.maskBox.add(handle);
			this.maskHandles.push(handle);			
		}
		
			var ms = this.maskSize.clone();
			var mp = this.maskPosition.clone();
			mp.add(new THREE.Vector3(-0.5,-0.5,-0.5));
			
			this.maskBox.position.copy(ms).multiplyScalar(0.5).add(mp);
			this.maskBox.scale.copy(ms);

	},

	enableMaskControls:function(enable, force){
		if(this.movingMaskEnabled != enable || force){
			this.movingMaskEnabled = enable;
			
			if(!this.movingMask){
				this.maskBox.material.side = enable ? THREE.FrontSide : THREE.BackSide;
				this.maskBox.material.color.opacity = enable ? 0.2 : 0.0;
				this.maskBox.material.depthWrite = !enable;
				for(var i = 0; i < this.maskHandles.length; i++){
					this.maskHandles[i].visible = enable;
				}
				if(enable){
					this.intersectingMask = this.raycaster.intersectObject(this.maskBox, this.movingMaskEnabled);
					this.canStroke = this.controls.panEnabled = this.controls.zoomEnabled = this.controls.rotateEnabled = false;
				} else {
					this.controls.panEnabled = this.controls.zoomEnabled = true;
					this.controls.rotateEnabled = this.controls.zoomEnabled;
					this.canStroke = false;
				}
			} 
		}			
	},
	
	updateMaskSizeSpinnersFromMask:function(){
		if(editScene.maskSpinnersUpdatesDisabled) return;
		
		editScene.maskSpinnersUpdatesDisabled = true;
		var x0 = notNaN($('#mask-x').spinner('value'));
		var y0 = notNaN($('#mask-y').spinner('value'));
		var z0 = notNaN($('#mask-z').spinner('value'));
		var x1 = notNaN($('#mask-x2').spinner('value'));
		var y1 = notNaN($('#mask-y2').spinner('value'));
		var z1 = notNaN($('#mask-z2').spinner('value'));
		
		if(x0 != this.maskPosition.x) $('#mask-x').spinner('value',this.maskPosition.x);
		if(y0 != this.maskPosition.y) $('#mask-y').spinner('value',this.maskPosition.y);
		if(z0 != this.maskPosition.z) $('#mask-z').spinner('value',this.maskPosition.z);

		if(this.maskingSizingMode){
			if(x1 != this.maskSize.x) $('#mask-x2').spinner('value',this.maskSize.x);
			if(y1 != this.maskSize.y) $('#mask-y2').spinner('value',this.maskSize.y);
			if(z1 != this.maskSize.z) $('#mask-z2').spinner('value',this.maskSize.z);
			
			$('#mask-x2').spinner({max: this.doc.width - this.maskPosition.x});
			$('#mask-y2').spinner({max: this.doc.height - this.maskPosition.y});
			$('#mask-z2').spinner({max: this.doc.depth - this.maskPosition.z});
		} else {
			x1 -= x0;
			y1 -= y0;
			z1 -= z0;
			if(x1 != this.maskSize.x) $('#mask-x2').spinner('value',this.maskSize.x + this.maskPosition.x);
			if(y1 != this.maskSize.y) $('#mask-y2').spinner('value',this.maskSize.y + this.maskPosition.y);
			if(z1 != this.maskSize.z) $('#mask-z2').spinner('value',this.maskSize.z + this.maskPosition.z);

			$('#mask-x2').spinner({max: this.doc.width});
			$('#mask-y2').spinner({max: this.doc.height});
			$('#mask-z2').spinner({max: this.doc.depth});
		}
		
		$('#mask-plane-x').slider('value',this.maskPosition.x);
		$("#mask-plane-x .ui-slider-handle").text(this.maskPosition.x);
		$('#mask-plane-y').slider('value',this.maskPosition.y);
		$('#mask-plane-y .ui-slider-handle').text(this.maskPosition.y);
		$('#mask-plane-z').slider('value',this.maskPosition.z);
		$('#mask-plane-z .ui-slider-handle').text(this.maskPosition.z);
		
		editScene.maskSpinnersUpdatesDisabled = false;
	},

	maskSpinnerChange: function(e){
		if(editScene.maskingMode != 'xyz' || editScene.movingMask || editScene.maskSpinnersUpdatesDisabled) return;

		function notNaN(v){ if(isNaN(v)) return 0; else return v; }

		var targ = e ? $(e.target).attr('id') : null;
		var newVal;
		var x0 = notNaN($('#mask-x').spinner('value'));
		var y0 = notNaN($('#mask-y').spinner('value'));
		var z0 = notNaN($('#mask-z').spinner('value'));
		var x1 = notNaN($('#mask-x2').spinner('value'));
		var y1 = notNaN($('#mask-y2').spinner('value'));
		var z1 = notNaN($('#mask-z2').spinner('value'));
		if(editScene.maskingSizingMode){
			x1 += x0;
			y1 += y0;
			z1 += z0;
		}
		switch(targ){
		case 'mask-x':
			if(editScene.maskingMode == 'x') x1 = x0 + 1;
			else x1 = Math.max(x0 + 1, x1);
			break;
		case 'mask-x2':
			x0 = Math.min(x1 - 1, x0);
			break;
		case 'mask-y':
			if(editScene.maskingMode == 'y') y1 = y0 + 1;
			else y1 = Math.max(y0 + 1, y1);			
			break;
		case 'mask-y2':
			y0 = Math.min(y1 - 1, y0);
			break;
		case 'mask-z':
			if(editScene.maskingMode == 'z') z1 = z0 + 1;
			else z1 = Math.max(z0 + 1, z1);			
			z1 = Math.max(z0 + 1, z1);
			break;
		case 'mask-z2':
			z0 = Math.min(z1 - 1, z0);
			break;
		}
		
		editScene.maskPosition.set(x0, y0, z0);
		editScene.maskSize.set(x1 - x0, y1 - y0, z1 - z0);
		
		editScene.maskPosition.x = Math.max(0, Math.min(editScene.doc.width - editScene.maskSize.x, editScene.maskPosition.x));
		editScene.maskPosition.y = Math.max(0, Math.min(editScene.doc.height - editScene.maskSize.y, editScene.maskPosition.y));
		editScene.maskPosition.z = Math.max(0, Math.min(editScene.doc.depth - editScene.maskSize.z, editScene.maskPosition.z));

		editScene.maskSize.x = Math.max(1, Math.min(editScene.doc.width - editScene.maskPosition.x, editScene.maskSize.x));
		editScene.maskSize.y = Math.max(1, Math.min(editScene.doc.height - editScene.maskPosition.y, editScene.maskSize.y));
		editScene.maskSize.z = Math.max(1, Math.min(editScene.doc.depth - editScene.maskPosition.z, editScene.maskSize.z));

		editScene.updateMaskBox();
		editScene.updateMaskSizeSpinnersFromMask();
	},

	maskingModeChange: function(e, ui){
		if(!e){
			$('#masking-mode ul li').first().find('a').trigger('click');
			return;
		}
		editScene.maskingMode = (e && e.currentTarget) ? $(e.currentTarget).attr('alt') : ((ui && ui.newTab) ? $(ui.newTab.context).attr('alt') : 'xyz');
		switch(editScene.maskingMode){
		case 'x':
			editScene.maskPosition.y = editScene.maskPosition.z = 0;
			editScene.maskSize.x = 1;
			editScene.maskSize.y = editScene.doc.height; editScene.maskSize.z = editScene.doc.depth;
			break;
		case 'y':
			editScene.maskPosition.x = editScene.maskPosition.z = 0;
			editScene.maskSize.y = 1;
			editScene.maskSize.x = editScene.doc.width; editScene.maskSize.z = editScene.doc.depth;
			break;
		case 'z':
			editScene.maskPosition.y = editScene.maskPosition.x = 0;
			editScene.maskSize.z = 1;
			editScene.maskSize.y = editScene.doc.height; editScene.maskSize.x = editScene.doc.width;
			break;
		}
		editScene.updateMaskBox();
		editScene.updateMaskSizeSpinnersFromMask();
	},
	
	maskPlaneSliderChanged:function(e, ui){
		var targid = $(e.target).attr('id');
		var val = ui.value;
		$('#'+targid+' .ui-slider-handle').text(ui.value);
		switch(targid){
		case 'mask-plane-x':
			editScene.maskPosition.x = val;
			break;
		case 'mask-plane-y':
			editScene.maskPosition.y = val;
			break;
		case 'mask-plane-z':
			editScene.maskPosition.z = val;
			break;
		}
		editScene.updateMaskBox();
	},
	
	maskPlaneStep:function(dv){
		switch(this.maskingMode){
		case 'x':
			this.maskPosition.x = Math.min(this.doc.width - 1, Math.max(0, this.maskPosition.x + dv));
			break;
		case 'y':
			this.maskPosition.y = Math.min(this.doc.height - 1, Math.max(0, this.maskPosition.y + dv));
			break;
		case 'z':
			this.maskPosition.z = Math.min(this.doc.depth - 1, Math.max(0, this.maskPosition.z + dv));
			break;
		}
		this.updateMaskBox();
		this.updateMaskSizeSpinnersFromMask();
	},
	
	maskInflate:function(e, v){
		if(editScene.maskingMode != 'xyz'){
			editScene.maskingModeChange();
		}
		if(e){
			if(e.target.id == 'mask-grow'){
				v = 1;
			} else {
				v = -1;
			}
		}
		
		if(!v) v = 0;
		
		var mp = editScene.maskPosition.clone();
		var ms = editScene.maskSize.clone();
		
		if(!(v < 0 && ms.x == 1)) editScene.maskPosition.x = Math.max(0, Math.min(editScene.doc.width - 1, mp.x - v));
		if(!(v < 0 && ms.y == 1)) editScene.maskPosition.y = Math.max(0, Math.min(editScene.doc.height - 1, mp.y - v));
		if(!(v < 0 && ms.z == 1)) editScene.maskPosition.z = Math.max(0, Math.min(editScene.doc.depth - 1, mp.z - v));

		editScene.maskSize.x = Math.max(1, Math.min(editScene.doc.width - editScene.maskPosition.x, ms.x + v * 2));
		editScene.maskSize.y = Math.max(1, Math.min(editScene.doc.height - editScene.maskPosition.y, ms.y + v * 2));
		editScene.maskSize.z = Math.max(1, Math.min(editScene.doc.depth - editScene.maskPosition.z, ms.z + v * 2));

		editScene.updateMaskBox();
		editScene.updateMaskSizeSpinnersFromMask();
	},
	
	maskSizingModeChanged: function(e){
		editScene.maskingSizingMode = e ? (e.target.value == 'size') : false;
		
		if(editScene.maskingSizingMode){
			$('#editor-mask label[for=mask-x]').html('X&nbsp;').removeClass('w3').addClass('w1');
			$('#editor-mask label[for=mask-y]').html('Y&nbsp;').removeClass('w3').addClass('w1');
			$('#editor-mask label[for=mask-z]').html('Z&nbsp;').removeClass('w3').addClass('w1');
			$('#editor-mask label[for=mask-x2]').html('<em>&nbsp;width&nbsp;</em>').addClass('w3');
			$('#editor-mask label[for=mask-y2]').html('<em>&nbsp;height&nbsp;</em>').addClass('w3');
			$('#editor-mask label[for=mask-z2]').html('<em>&nbsp;depth&nbsp;</em>').addClass('w3');
		} else {
			$('#editor-mask label[for=mask-x]').html('X&nbsp;<em>min&nbsp;</em>').addClass('w3').removeClass('w1');
			$('#editor-mask label[for=mask-y]').html('Y&nbsp;<em>min&nbsp;</em>').addClass('w3').removeClass('w1');
			$('#editor-mask label[for=mask-z]').html('Z&nbsp;<em>min&nbsp;</em>').addClass('w3').removeClass('w1');
			$('#editor-mask').find('label[for=mask-x2],label[for=mask-y2],label[for=mask-z2]').html('<em>&nbsp;max&nbsp;</em>').removeClass('w3');
		}
		
		editScene.updateMaskSizeSpinnersFromMask();
	},
	
	maskReset: function(){
		$('#mask-x').spinner('value',0); $('#mask-x2').spinner('value',editScene.doc.width);
		$('#mask-y').spinner('value',0); $('#mask-y2').spinner('value',editScene.doc.height);
		$('#mask-z').spinner('value',0); $('#mask-z2').spinner('value',editScene.doc.depth);
		
		$('#masking-mode label[for=masking-mode-free]').trigger('click');
		
		editScene.maskingModeChange();
	},
	
	maskWrap: function(){
		var min = new THREE.Vector3(Infinity,Infinity,Infinity);
		var max = new THREE.Vector3(-Infinity,-Infinity,-Infinity);
		var numPix = 0;
		for(var x = 0; x < this.doc.width; x++){
		for(var y = 0; y < this.doc.height; y++){
		for(var z = 0; z < this.doc.depth; z++){
			addr = x * this.doc.depth * this.doc.height + y * this.doc.depth + z;
			var p = this.doc.frames[this._currentFrame][addr];
			if(p && p.a){
				numPix++;
				min.set(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
				max.set(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
			}
		}}}
	
		if(!numPix) this.maskReset();
		else {
			this.maskSize.set(max.x - min.x + 1, max.y - min.y + 1, max.z - min.z + 1);
			this.maskPosition.set(min.x, min.y, min.z);
			this.updateMaskBox();
			this.updateMaskSizeSpinnersFromMask();
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Preview */
	
	createDataObject:function(options, raw){
		var obj = {
			name:(options['name'] ? options['name'] : null),
			width:this.doc.width, height:this.doc.height, depth:this.doc.depth,
			floor: (options['floor'] ? options['floor'] : false),
			optimize: (options['optimize'] ? options['optimize'] : false),
			smoothNormals: ((options['smoothNormals'] != undefined) ? options['smoothNormals'] : 0.9),
			occlusion: ((options['occlusion'] != undefined) ? options['occlusion'] : 1.0),
			pointSize: ((options['pointSize'] != undefined) ? options['pointSize'] : 1.0),
			frames:[],
			anchors:{},
			anims: this.doc.anims,
			meta: this.doc.meta
		};
		
		this.model.geometry.data.optimize = false;
		// process frames
		for(var f = 0; f < this.doc.frames.length; f++){
			// encode frame
			if(raw){
				this.model.replaceFrame(this.doc.frames[f],f);
				this.model.encodeRawFrame(obj, f);
			} else {
				THREE.PixelBox.encodeFrame(this.doc.frames[f], obj);
			}
			// process anchors
			var anchors = this.doc.frames[f].anchors;
			if(anchors){
				// replace duplicate anchor names with .id's
				var frameAnchors = {};
				for(var i = 0; i < anchors.length; i++){
					if(frameAnchors[anchors[i].name]){
						frameAnchors[anchors[i].id] = anchors[i];
					} else {
						frameAnchors[anchors[i].name] = anchors[i];
					}
				}
				// store anchor frame
				for(var aname in frameAnchors){
					if(!obj.anchors[aname]) obj.anchors[aname] = [];
					var fa = frameAnchors[aname];
					obj.anchors[aname].push({
						x:fa.x, y:fa.y, z:fa.z, rx: fa.rx, ry: fa.ry, rz: fa.rz, sx:fa.sx, sy:fa.sy, sz:fa.sz, meta:fa.meta, on:fa.on
					});
				}
			}
		}
		
		if(raw){ this.optimizeChanged(); }
		delete obj.assembledFrames;
		return obj;
	},
	
	smoothNormalsChanged:function(){
		if(editScene.playing) editScene.playing = false;
		
		editScene.model.geometry.data.smoothNormals = editScene.doc.smoothNormals = notNaN($('#preview-smooth-normals').spinner('value')) * 0.01;
		localStorage.setItem('doc-smooth', editScene.doc.smoothNormals);
		editScene.model.replaceFrame(editScene.doc.frames[editScene.currentFrame],editScene._currentFrame);
	},

	occlusionChanged:function(){
		editScene.model.occlusion = editScene.doc.occlusion = notNaN($('#preview-occlusion').spinner('value')) * 0.01;
		localStorage.setItem('doc-occlusion', editScene.doc.occlusion);		
	},
	
	pointSizeChanged:function(){
		editScene.model.pointSize = editScene.doc.pointSize = notNaN($('#preview-point-size').spinner('value'));
	},
	
	optimizeChanged:function(){
		if(editScene.playing) editScene.playing = false;
		editScene.model.geometry.data.optimize = editScene.doc.optimize = $('#preview-optimize').get(0).checked;
		localStorage.setItem('doc-optimize', editScene.doc.optimize);
		editScene.model.replaceFrame(editScene.doc.frames[editScene.currentFrame],editScene.currentFrame);
	},

	floorChanged:function(){
		if(editScene.playing) editScene.playing = false;
		editScene.model.geometry.data.floor = editScene.doc.floor = $('#preview-floor').get(0).checked;
		editScene.model.replaceFrame(editScene.doc.frames[editScene.currentFrame],editScene.currentFrame);
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Container & display functions */

	/* called after new doc is created to recreate container with axis, and model */
	createContainer:function(){
		// recreate container
		if(this.container){
			while(this.container.children.length){
				this.container.remove(this.container.children[0]);
			}
			this.scene.remove(this.container);
			this.maskBox = null;
		}
		
		var skipRaycast = function(){ return; };
		
		// axis
		this.container = new THREE.Object3D();
		this.scene.add(this.container);
		
		// axis
		var axis = new THREE.AxisHelper(4);
		axis.position.set(-0.5, -0.5, -0.5);
		axis.raycast = skipRaycast;
		this.container.add(axis);
		
		// continue axis
		var mat = new THREE.LineDashedMaterial({color:0x999999, dashSize:0.5, gapSize: 0.5});
		var geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(4, -0.5, -0.5), new THREE.Vector3(this.doc.width - 0.5, -0.5, -0.5));
		var extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, 4, -0.5), new THREE.Vector3(-0.5, this.doc.height - 0.5, -0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, -0.5, 4), new THREE.Vector3(-0.5, -0.5, this.doc.depth - 0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);

		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(this.doc.width - 0.5, -0.5, -0.5), new THREE.Vector3(this.doc.width - 0.5, this.doc.height - 0.5, -0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(this.doc.width - 0.5, -0.5, -0.5), new THREE.Vector3(this.doc.width - 0.5, -0.5, this.doc.depth - 0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);

		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, this.doc.height - 0.5, -0.5), new THREE.Vector3(-0.5, this.doc.height - 0.5, this.doc.depth - 0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, this.doc.height - 0.5, -0.5), new THREE.Vector3(this.doc.width - 0.5, this.doc.height - 0.5, -0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);		
		
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, -0.5, this.doc.depth - 0.5), new THREE.Vector3(-0.5, this.doc.height - 0.5, this.doc.depth - 0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);
		geom = new THREE.Geometry();
		geom.vertices.push(new THREE.Vector3(-0.5, -0.5, this.doc.depth - 0.5), new THREE.Vector3(this.doc.width - 0.5, -0.5, this.doc.depth - 0.5));
		extent = new THREE.Line(geom, mat);
		extent.raycast = skipRaycast;
		this.container.add(extent);

		// update mask limits
		editScene.maskSpinnersUpdatesDisabled = true;
		$( "#mask-x").spinner({min:0, max:editScene.doc.width - 1}).spinner('value', 0);
	    $( "#mask-x2").spinner({min:1, max:editScene.doc.width }).spinner('value', editScene.doc.width);
		$( "#mask-y").spinner({min:0, max:editScene.doc.height - 1}).spinner('value', 0);
	    $( "#mask-y2").spinner({min:1, max:editScene.doc.height }).spinner('value', editScene.doc.height);
		$( "#mask-z").spinner({min:0, max:editScene.doc.depth - 1}).spinner('value', 0);
	    $( "#mask-z2").spinner({min:1, max:editScene.doc.depth }).spinner('value', editScene.doc.depth);
   		$('#mask-plane-x').slider({max: editScene.doc.width - 1});
   		$('#mask-plane-y').slider({max: editScene.doc.height - 1});
   		$('#mask-plane-z').slider({max: editScene.doc.depth - 1});
		editScene.maskSpinnersUpdatesDisabled = false;
		
		this.updateMaskBox();
		
		// reset masking mode
		var mm = $('#masking-mode-free');
		if(mm.length && !mm.get(0).checked){
			this.maskingModeChange();
		}
		
		// thumb cam
		this.updateThumbnailCamera();
		
		// scale "floor" plane
		this.shadowPreviewPlane.scale.set(1.0, 1.0, 1.0).multiplyScalar(2.0 * Math.max(this.doc.width, this.doc.depth, this.doc.height));
		this.shadowPreviewPlane.position.set(this.doc.width * 0.5, -0.6, this.doc.depth * 0.5);

		// recenter controls and lights with target
		this.controls.center.set(this.doc.width * 0.5, this.doc.height * 0.5, this.doc.depth * 0.5);//target
		this.updatePointLightPos();
		this.updateDirectLightPos();
		this.updateSpotLightPos();
		
		// recreate model
		if(this.model){
			this.model.dispose();
			this.scene.remove(this.model);
		}
		
		// reset these
		this.spot.castShadow = true;
		this.sun.castShadow = true;
		
		this.model = new THREE.PixelBox({
			width: this.doc.width, height: this.doc.height, depth: this.doc.depth, 
			smoothNormals: this.doc.smoothNormals, occlusion: this.doc.occlusion, optimize: this.doc.optimize,floor: this.doc.floor,
			frames: null
		});
		this.model.material.uniforms.cullBack.value = 0;
		this.model.dynamic = true;
		this.model.castShadow = true;
		this.model.receiveShadow = true;
		this.scene.add(this.model);

		// set these after model has been created
		setTimeout(function(){
			editScene.spot.castShadow = (localStorage.getItem('spot-shadow') !== 'false');
			editScene.sun.castShadow = (localStorage.getItem('direct-shadow') !== 'false');		
			editScene.model.material.needsUpdate = true;
			THREE.PixelBox.updateLights(editScene.scene);
		}, 500);
	},
	
	resetZoom:function(){
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.controls.focus(this.maskBox, true);
  		this.refreshThumbnails(); // side affect after loading
	},
	
	toggleShowFloor:function(){
		localStorage.setItem('floorHidden',editScene.shadowPreviewPlane.visible);
		editScene.shadowPreviewPlane.visible = !editScene.shadowPreviewPlane.visible;
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Thumbnails on timeline */

	updateThumbnailCamera:function(){
		var center = new THREE.Vector3(this.doc.width * 0.5, this.doc.height * 0.5, this.doc.depth * 0.5);
		if(this.thumbnailCameraUserAngle){
			this.thumbnailCameraUserAngle = this.camera.position.clone();
			localStorage.setItem('thumbnailCameraUserAngle',this.thumbnailCameraUserAngle.x+','+this.thumbnailCameraUserAngle.y+','+this.thumbnailCameraUserAngle.z);
			this.thumbnailCamera.position.copy(this.thumbnailCameraUserAngle);
		} else {
			this.thumbnailCamera.position.set(1024,768,1024).add(center);
		}
		this.thumbnailCamera.position.sub(center).normalize();
		
		var maxDim = Math.max(this.doc.width, this.doc.height, this.doc.depth) * 2.0;
		this.thumbnailCamera.left = this.thumbnailCamera.bottom = -maxDim * 0.5;
		this.thumbnailCamera.right = this.thumbnailCamera.top = maxDim * 0.5;
		
		this.thumbnailCamera.position.multiplyScalar(maxDim).add(center);
		this.thumbnailCamera.lookAt(center);
		
		this.thumbnailCamera.distanceToCenter = this.thumbnailCamera.position.distanceTo(center);
		
		this.thumbnailCamera.updateProjectionMatrix();
	},
	
	toggleThumbnailCamera:function(){
		if(this.thumbnailCameraUserAngle){
			this.thumbnailCameraUserAngle = null;
			localStorage.removeItem('thumbnailCameraUserAngle');
		} else {
			this.thumbnailCameraUserAngle = this.camera.position.clone();
			localStorage.setItem('thumbnailCameraUserAngle',this.thumbnailCameraUserAngle.x+','+this.thumbnailCameraUserAngle.y+','+this.thumbnailCameraUserAngle.z);
		}
		$('#thumb-persp').text(this.thumbnailCameraUserAngle ? 'cam angle' : '3/4 view');
		this.updateThumbnailCamera();
		this.thumbnails = new Array(editScene.doc.frames.length);
		this.refreshThumbnails();
	},

	/* notification to update thumbnail */
	frameContentsChanged:function(f){
		this.thumbnails[f] = {};
		this.refreshThumbnails();
	},

	refreshThumbnails:function(){
		var th = $('#frame-thumbnails');
		if(!th.length) { return; }
		
		var curThumbs = $('img', th).toArray();
		var keepThumbs = [];
		
		var thumbSize = this.thumbfbo.width;
		var tw = $('#editor-timeline').innerWidth() - thumbSize - 40;
		var s = tw / Math.max(1,(this.thumbnails.length - 1));
		var aw = Math.min(thumbSize, Math.floor(s - 4));
		var vpv = this.model.material.uniforms.viewPortScale.value;

		// scrolling
		if(aw < thumbSize * 0.5){
			aw = thumbSize * 0.5;
			s = aw + 4;
			tw = (s * this.thumbnails.length - 1) + thumbSize + 20;
			$('#timeline-container').css({width:tw});
		} else {
			$('#timeline-container').css({width:'100%'});
		}

		// setup
		this.model.pointSize = Math.min(10.0, Math.max(1, this.doc.pointSize * 32.0 / this.thumbnailCamera.distanceToCenter));
		this.model.material.uniforms.viewPortScale.value = 2.0;
		for(var i = 0; i < this.scene.children.length; i++){
			var so = this.scene.children[i];
			if(so == this.model || so instanceof THREE.Light) continue;
			so.wasVisible = so.visible;
			so.visible = false;
		}
		THREE.PixelBox.updateLights(this.scene);
		
		var thumbTop = (this.doc.anims.length ? 22 : 2) + (this.thumbfbo.width - aw) * 0.5;
		for(var f = 0; f < this.thumbnails.length; f++){
			var thumbObj = this.thumbnails[f];
			if(!thumbObj) { this.thumbnails[f] = thumbObj = {}; }// for reset		
			if(!thumbObj.image){
				thumbObj.image = this.generateThumb(f);
			}
			
			keepThumbs.push(thumbObj.image);
			
			th.append(thumbObj.image);
			$(thumbObj.image).css({left:10 + (thumbSize * 0.5 + f * s)-(aw * 0.5), top: thumbTop, width: aw, height: aw}).attr('id','frame-thumb-'+f);
		}
		
		// store thumb step (used during dragging frames)
		this.distanceBetweenThumbnails = s;
		
		// reset back
		this.model.frame = this._currentFrame;
		this.model.material.uniforms.viewPortScale.value = vpv;
		this.model.pointSize = this.doc.pointSize;
		for(var i = 0; i < this.scene.children.length; i++){
			var so = this.scene.children[i];
			if(so == this.model || so instanceof THREE.Light) continue;
			so.visible = so.wasVisible;
		}
		
		var toRemove = _.difference(curThumbs, keepThumbs);
		for(var i = 0; i < toRemove.length; i++){ 
			$(toRemove[i]).remove();
		}
		
		$('#frame-thumbnails img').removeClass('current');
		$('#frame-thumb-'+this._currentFrame).addClass('current');
		editScene.updateRangeBackgroundDisplay();
		
		this.refreshAnimations();
	},
	
	generateThumb:function(f){
		var gl = renderer.webgl.context;
		
		// render to fbo
		this.model.frame = f;
		THREE.PixelBox.updateLights(this.scene);
			
		//renderer.webgl.setClearColor( 0x0, 0 );
		renderer.webgl.render(this.scene, this.thumbnailCamera, this.thumbfbo, true );
		
		// copy fbo to image
		var data = new Uint8Array(this.thumbfbo.width * this.thumbfbo.height * 4);
		gl.readPixels(0,0,this.thumbfbo.width, this.thumbfbo.height,gl.RGBA, gl.UNSIGNED_BYTE,data);
		
		var canvas = document.createElement("canvas");
		canvas.width = this.thumbfbo.width;
		canvas.height = this.thumbfbo.height;
		
		var imgData = canvas.getContext('2d').createImageData(this.thumbfbo.width, this.thumbfbo.height);
		imgData.data.set(data);
		
		canvas.getContext('2d').putImageData(imgData, 0, 0);
		var image = new Image(this.thumbfbo.width, this.thumbfbo.height);
		image.src = canvas.toDataURL();
		
		// add events
		$(image).draggable({ axis:'x', containment: 'parent', helper:'clone', cursor:'ew-resize', opacity: 0.5, grid:[5, 10],
			drag: this.thumbnailDragMoved.bind(this),
			start: this.thumbnailDragStarted.bind(this),
			stop: this.thumbnailDragFinished.bind(this)
		}).click(this.thumbnailClicked);
		
		return image;
	},
	
	thumbnailDragStarted:function(e,ui){
		ui.helper.addClass('dragged');
		this.draggingFrame = e.target;
		this.draggingFrameIndex = parseInt(e.target.id.substr(12));
		this.draggingFrameDropPosition = null;
		$('#frame-range').css({ width: 10, display: 'none' });
	},
	
	thumbnailDragMoved:function(e,ui){
		var dropPosition = 0;
		var dropTarget = null;
		
		var helper = $(ui.helper);
		var dragX = Math.floor(helper.offset().left + helper.width() * 0.5);
		
		var insertIndicatorPos = 0;
		
		for(var i = 0; i < this.thumbnails.length; i++){
		
			var img = this.thumbnails[i].image;
			var offs = $(img).offset();
			var width = $(img).width();
			var center = Math.floor(offs.left + width * 0.5);
			var indexOffset = (i > this.draggingFrameIndex) ? -1 : 0;
			if(dragX >= center - this.distanceBetweenThumbnails * 0.5 && dragX < center + this.distanceBetweenThumbnails * 0.5) {
				if(dragX < center){
					dropPosition = i + indexOffset;
					insertIndicatorPos = center - this.distanceBetweenThumbnails * 0.5;
				} else {
					dropPosition = i + 1 + indexOffset;
					insertIndicatorPos = center + this.distanceBetweenThumbnails * 0.5 - 1;
				}
				dropTarget = img;
				break;
			}			
			
		}
		
		// same frame
		if(dropTarget == this.draggingFrame || dropPosition == this.draggingFrameIndex) { 
			dropPosition = null;
			$('#frame-range').css({ width: 10, display: 'none' });
		// new loc
		} else {
			insertIndicatorPos = Math.max(0, Math.min($('#frame-thumbnails').width() - 10, insertIndicatorPos - 10));
			$('#frame-range').css({ left: Math.floor(insertIndicatorPos), display: 'block' });
		}		
		
		this.draggingFrameDropPosition = dropPosition;
	},
	
	thumbnailDragFinished:function(e,ui){
		$('#frame-range').css({ display: 'block' });
		if($('#editor-timeline').hasClass('collapsed')) $('#frame-range').hide();
		
		if(this.draggingFrameDropPosition === null) { 
			this.refreshThumbnails();
			return;
		}
		
		this.moveFrame(this.draggingFrameIndex, this.draggingFrameDropPosition);
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Animations */

	automaticColorForIndex: function(i, alpha, returnColorObject){
		var hue = ((i + (i % 2 ? 5 : 1)) % 10) * 0.1;
		var sat = 0.9 - 0.6 * (Math.floor(i * 0.1) % 5) / 5;
		var color = new THREE.Color();
		color.setHSL(hue, sat, 0.5);
		
		if(returnColorObject) return color;
		
		return 'rgba('+Math.floor(color.r * 255.0)+','+Math.floor(color.g * 255.0)+','+Math.floor(color.b * 255.0)+','+alpha+')';
	},

	/* redisplays animation rows in UI */
	refreshAnimations: function(){
		var prevSelected = $('#anim-list div.selected').attr('id');
		$('#anim-list').children().remove();
		$('#frame-thumbnails span.frame-label').remove();
		
		var rows = [];
		var frameLabels = {};
		for(var i = 0; i < this.doc.anims.length; i++){
			var anim = this.doc.anims[i];
			var color = this.automaticColorForIndex(i, 0.5);
			var newRow = $('<div class="anim-row" id="anim-row-'+i+'" alt="'+anim.start+'"><div class="tiny-swatch" style="background-color:'+color+'"/><label/><span class="frames"></span></div>');
			newRow.find('label').text(anim.name);
			newRow.find('span').html((anim.start + 1) + ' - ' + (anim.start + anim.length) + ' <em>( '+anim.length+' )</em>');
			if(newRow.attr('id') == prevSelected) newRow.addClass('selected');
			newRow.click(this.animSelect.bind(this)).dblclick(this.animSetRange.bind(this));
			rows.push(newRow);
			
			var img = $('#frame-thumbnails img#frame-thumb-'+anim.start);
			var imgEnd = $('#frame-thumbnails img#frame-thumb-'+Math.min(anim.start + anim.length - 1, this.thumbnails.length - 1));
			if(img.length){
				if(frameLabels[anim.start]){
					frameLabels[anim.start] = frameLabels[anim.start] + ', ' + anim.name;
				} else {
					frameLabels[anim.start] = anim.name;
				}
				
				var label = $('<span class="frame-label frame-label-'+anim.start+'" style="background-color:'+color+';">&nbsp;</span>');
				$('#frame-thumbnails').append(label);
				
				var pos = Math.floor(img.position().left); //Math.floor(img.position().left + (img.outerWidth() - label.outerWidth()) * 0.5);//
				label.css({left: pos, width: Math.floor(imgEnd.offset().left + imgEnd.width() - pos - 20) });
			}
		}
		
		rows.sort(function(a,b){
			var as = parseInt(a.attr('alt'));
			var bs = parseInt(b.attr('alt'));
			if(as < bs) return -1;
			if(as == bs) return 0;
			return 1;
		});	
		
		if(rows.length) rows.push($('<hr/><div style="height:4em;"/>'));
		
		for(var i in frameLabels){
			$('#frame-thumbnails span.frame-label-'+i).last().text(frameLabels[i]);
		}
		
		$('#anim-list').append(rows);
		
		if(prevSelected) $('#'+prevSelected).trigger('click');
		
		if($('#anim-list div.selected').length){
			$('#anim-details').show();
		} else {
			$('#anim-details').hide();
		}
		
		if(this.doc.anims.length) {
			$('#frame-thumbnails').addClass('has-anims');
		} else {
			$('#frame-thumbnails').removeClass('has-anims');
		}
	},

	animSelect:function(e){
		var row = $(e.target).closest('.anim-row');
		$('#anim-list .anim-row').removeClass('selected');
		
		if(row.length){
			row = row.get(0);
			$(row).addClass('selected');
			
			// populate fields
			var index = parseInt(row.id.substr(9));
			var anim = editScene.doc.anims[index];
			editScene.animUpdatesDisabled = true;
			
			$('#anim-name').val(anim.name);
			$('#anim-meta').val(anim.meta);
			$('#anim-fps').spinner('value', anim.fps);
			$('#anim-start').spinner('option', { max: this.doc.frames.length });
			$('#anim-len').spinner('option', { max: this.doc.frames.length - $('#anim-start').spinner('value') + 1});
			$('#anim-start').spinner('value', anim.start + 1);
			$('#anim-len').spinner('value', anim.length);
			
			editScene.animUpdatesDisabled = false;
			$('#anim-details').show();
		} else {
			$('#anim-details').hide();
		}
	},

	animAdd:function(e, index){
		var selAnim = null;
		if(index === undefined) {
			var selRow = $('#anim-list div.selected');
			if(selRow.length){
				index = parseInt(selRow.attr('id').substr(9));
				selAnim = this.doc.anims[index];
			} else {
				index = 0;
			}
		}
		
		this.addUndo({redo:[this.animAdd, null, index], undo:[this.animDelete, null, index] });
		
		var newAnim = { 
			name: 'anim', 
			fps: (selAnim ? selAnim.fps : 10), 
			start:(selAnim ? (selAnim.start + selAnim.length) : this._currentFrame),
			length: (selAnim ? selAnim.length : (this.doc.frames.length - this._currentFrame)),
			meta: ''
		};
		
		newAnim.start = Math.min(newAnim.start, this.doc.frames.length - 1);
		newAnim.length = Math.min(newAnim.length, this.doc.frames.length - newAnim.start);
		
		this.doc.anims.splice(index, 0, newAnim);
		
		this.refreshThumbnails();
		$('#anim-row-'+index).trigger('click');
	},

	animDupe:function(e, index){
		var selAnim = null;
		if(index === undefined) {
			var selRow = $('#anim-list div.selected');
			if(selRow.length){
				index = parseInt(selRow.attr('id').substr(9));
			} else {
				index = 0;
			}
		}
		
		if(index >= this.doc.anims.length) return;
		
		this.addUndo({redo:[this.animDupe, null, index], undo:[this.animDelete, null, index] });
		
		selAnim = this.doc.anims[index];
		
		var newAnim = _.deepClone(selAnim);
		
		newAnim.start = Math.min(newAnim.start, this.doc.frames.length - 1);
		newAnim.length = Math.min(newAnim.length, this.doc.frames.length - newAnim.start);
		
		this.doc.anims.splice(index, 0, newAnim);
		
		this.refreshThumbnails();
		
		$('#anim-row-'+(index+1)).trigger('click');
	},

	animDelete:function(e, index){
		var selAnim = null;
		if(index === undefined) {
			var selRow = $('#anim-list div.selected');
			if(selRow.length){
				index = parseInt(selRow.attr('id').substr(9));
			} else {
				index = 0;
			}
		}
		
		selAnim = this.doc.anims[index];
		
		this.addUndo({redo:[this.animDelete, null, index], undo:[this.animInsert, index, selAnim] });

		this.doc.anims.splice(index, 1);

		this.refreshThumbnails();
		
		$('#anim-row-'+index).trigger('click');
	},
	
	animInsert:function(index, obj){
		this.addUndo({redo:[this.animInsert, index, obj], undo:[this.animDelete, null, index] });
		
		this.doc.anims.splice(index, 0, obj);

		this.refreshThumbnails();
		
		$('#anim-row-'+index).trigger('click');
	},

	animFPSChanged:function(e, ui){
		if(this.animUpdatesDisabled) return;
	
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		if(e.type == 'spinchange'){
			var anim = _.deepClone(this.doc.anims[index]);
			anim.fps = $('#anim-fps').spinner('value');
				this.updateAnimation(index, anim);
		}
	},
	
	animNameChanged:function(e){
		if(this.animUpdatesDisabled) return;
	
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		var anim = _.deepClone(this.doc.anims[index]);
		anim.name = e.target.value;
		this.updateAnimation(index, anim);
	},

	animStartChanged:function(e, ui){
		if(this.animUpdatesDisabled) return;
	
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		var value = $('#anim-start').spinner('value') - 1;
		$('#anim-len').spinner('option', { max: this.doc.frames.length - value});
		if(e.type == 'spinchange'){
			var anim = _.deepClone(this.doc.anims[index]);
			anim.start = value;
			if(value + anim.length > this.doc.frames.length){
				anim.length = this.doc.frames.length - value;
				this.animUpdatesDisabled = true;
				$('#anim-len').spinner('value', anim.length);
				this.animUpdatesDisabled = false;
			}			
			this.updateAnimation(index, anim);
		}
	},	

	animLengthChanged:function(e, ui){
		if(this.animUpdatesDisabled) return;
		
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		var value = $('#anim-len').spinner('value');
		if(e.type == 'spinchange'){
			// valudate length
			var anim = _.deepClone(this.doc.anims[index]);
			anim.length = value;
			this.updateAnimation(index, anim);
		}
	},

	animMetaChanged:function(e, ui){
		if(this.animUpdatesDisabled) return;
		
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		var anim = _.deepClone(this.doc.anims[index]);
		anim.meta = e.target.value;
		this.updateAnimation(index, anim);
	},
	
	animSetFromRange:function(){
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		
		var anim = _.deepClone(this.doc.anims[index]);
		var values = $('#frame-range-slider').slider('values');
		if((values[0]-1) != anim.start || (values[1] - values[0]+1) != anim.length){
			anim = _.deepClone(anim);
			anim.start = values[0] - 1;
			anim.length = values[1] - values[0] + 1;
			this.updateAnimation(index, anim);
		}
			
	},

	animSetRange:function(){
		var index, selRow = $('#anim-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(9));
		} else return;
		
		var anim = this.doc.anims[index];
		$('#frame-range-slider').slider('values',[anim.start + 1, anim.start + anim.length]);
		if($('#editor-timeline').hasClass('collapsed')) this.toggleFrameRange();
	},
	
	updateAnimation:function(animIndex, newObject) {
		if(this.animUpdatesDisabled) return;

		var oldAnim = this.doc.anims[animIndex];
		this.addUndo({redo:[this.updateAnimation, animIndex, newObject], undo:[this.updateAnimation, animIndex, oldAnim] });
		
		this.doc.anims[animIndex] = newObject;
		
		this.refreshAnimations();
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Anchors  */

	updateAnchorPositions:function(){
		var anchors = this.doc.frames[this.currentFrame].anchors || [];
		var toKeep = [];
		
		var anchorsChildren = this.anchors.children;
		var degToRad = Math.PI / 180;
		var selectedAnchor = $('#anchor-list div.selected');
		var anchorIndex = selectedAnchor.length ? parseInt(selectedAnchor.attr('id').substr(11)) : null;
		
		for(var i = 0; i < anchors.length; i++){
			var anchor = anchors[i];
			var obj3d = null;
			// find 
			for(var ai = 0; ai < anchorsChildren.length; ai++){
				if(anchorsChildren[ai].uuid == anchor.id){
					obj3d = anchorsChildren[ai];
					break;
				}
			}
			if(!obj3d){
				obj3d = new THREE.AxisHelper(1.0);
				obj3d.uuid = anchor.id;
				var cube = new THREE.Mesh(this.geomCube, new THREE.MeshBasicMaterial({ color: this.automaticColorForIndex(i, 1.0, true).getHex() }));
				obj3d.add(cube);
				this.anchors.add(obj3d);				
			}
			if(selectedAnchor.length && anchorIndex == i){
				obj3d.material.opacity = 1.0;
				obj3d.children[0].visible = true;
			} else {
				obj3d.material.opacity = 0.25;
				obj3d.children[0].visible = false;
			}
			obj3d.visible = !!anchor.on;
			obj3d.position.set(anchor.x, anchor.y, anchor.z);
			obj3d.rotation.set(anchor.rx * degToRad, anchor.ry * degToRad, anchor.rz * degToRad);
			obj3d.scale.set(anchor.sx || 1.0, anchor.sy || 1.0, anchor.sz || 1.0);
			toKeep.push(obj3d);
		}
		// remove
		var toRemove = _.difference(anchorsChildren, toKeep);
		for(var i = 0; i < toRemove.length; i++){ this.anchors.remove(toRemove[i]); }
		
	},

	anchorsVisibleChanged:function(e){
		this.anchors.visible = e.target.checked;
		localStorage.setItem('show-anchors', this.anchors.visible);
	},

	refreshAnchors:function(){
		var prevSelected = $('#anchor-list div.selected').attr('id');
		$('#anchor-list').children().remove();
		
		var rows = [];
		var anchors = this.doc.frames[this._currentFrame].anchors;
		if(!anchors) anchors = [];
		for(var i = 0; i < anchors.length; i++){
			var anchor = anchors[i];
			var color = this.automaticColorForIndex(i, 1.0);
			var newRow = $('<div class="anchor-row" id="anchor-row-'+i+'"><input type="checkbox"'+(anchor.on ? 'checked="checked"' : '')+'/><div class="tiny-swatch" style="background-color:'+color+'"/><label/></div>');
			newRow.find('label').text(anchor.name);
			if(newRow.attr('id') == prevSelected) newRow.addClass('selected');
			newRow.click(this.anchorSelect.bind(this));
			newRow.find('input').change(this.anchorOnChanged.bind(this));
			rows.push(newRow);
		}
		
		rows.sort(function(a,b){
			if(a.name < b.name) return -1;
			if(a.name > b.name) return 1;
			return 0;
		});	
		
		if(rows.length) rows.push($('<hr/><div style="height:4em;"/>'));
		
		$('#anchor-list').append(rows);
		
		if(prevSelected) $('#'+prevSelected).trigger('click');
		
		if($('#anchor-list div.selected').length){
			$('#anchor-details').show();
		} else {
			$('#anchor-details').hide();
		}
		this.updateAnchorPositions();
	},
	
	anchorOnChanged:function(e){
		if(this.anchorUpdatesDisabled) return;
		
		e.stopPropagation();
		
		var selRow = $(e.target).closest('.anchor-row');
		var index = parseInt(selRow.attr('id').substr(11));
		
		var anchor = _.deepClone(this.doc.frames[this._currentFrame].anchors[index]);
		anchor.on = e.target.checked ? 1 : 0;
		this.updateAnchor(this._currentFrame, index, anchor);		
	},
	
	anchorInsert:function(index, objArray){
		this.addUndo({undo:[this.anchorDelete, null, index], redo:[this.anchorInsert, index, objArray]});
		for(var f = 0; f < this.doc.frames.length; f++){
			var frame = this.doc.frames[f];
			if(frame.anchors == undefined) frame.anchors = [];
			frame.anchors.splice(index, 0, objArray[f]);
		}
		
		this.refreshAnchors();
	},
	
	anchorDelete:function(e, index){
		if(index === undefined) {
			var selRow = $('#anchor-list div.selected');
			if(selRow.length){
				index = parseInt(selRow.attr('id').substr(11));
			} else {
				return;
			}
		}

		var objArray = [];
		for(var f = 0; f < this.doc.frames.length; f++){
			var frame = this.doc.frames[f];
			objArray.push(frame.anchors[index]);
			frame.anchors.splice(index, 1);
		}
		this.addUndo({undo:[this.anchorInsert, index, objArray], redo:[this.anchorDelete, null, index]});
		this.refreshAnchors();
	},
	
	anchorAdd:function(e){
		var anchor = {
			name: 'anchor',
			id: THREE.Math.generateUUID(),
			x: Math.floor(this.doc.width * 0.5),
			y: Math.floor(this.doc.height * 0.5),
			z: Math.floor(this.doc.depth * 0.5),
			rx:0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1,
			on:1,
			meta: ''
		};
		var objArray = [];
		for(var i = 0; i < this.doc.frames.length; i++){ objArray.push(_.deepClone(anchor)); }
		this.anchorInsert(this.doc.frames[this._currentFrame].anchors ? this.doc.frames[this._currentFrame].anchors.length : 0, objArray);
		
		$('#anchor-row-'+(this.doc.frames[this._currentFrame].anchors.length-1)).trigger('click');
	},

	anchorDupe:function(e){
		var index;
		var selRow = $('#anchor-list div.selected');
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(11));
		} else {
			return;
		}

		var objArray = [];
		var newId = THREE.Math.generateUUID();
		for(var i = 0; i < this.doc.frames.length; i++){ 
			var newObj = _.deepClone(this.doc.frames[i].anchors[index]);
			newObj.id = newId;
			objArray.push(newObj); 
		}
		this.anchorInsert(this.doc.frames[this._currentFrame].anchors.length, objArray);
	},

	anchorSelect:function(e){
		var row = $(e.target).closest('.anchor-row');
		$('#anchor-list .anchor-row').removeClass('selected');
		
		if(row.length){
			row = row.get(0);
			$(row).addClass('selected');
			
			// populate fields
			var index = parseInt(row.id.substr(11));
			var anchor = editScene.doc.frames[this._currentFrame].anchors[index];
			editScene.anchorUpdatesDisabled = true;
			
			$('#anchor-name').val(anchor.name);
			$('#anchor-meta').val(anchor.meta);
			$('#anchor-x').spinner('value', anchor.x);
			$('#anchor-y').spinner('value', anchor.y);
			$('#anchor-z').spinner('value', anchor.z);
			$('#anchor-rx').spinner('value', anchor.rx);
			$('#anchor-ry').spinner('value', anchor.ry);
			$('#anchor-rz').spinner('value', anchor.rz);
			$('#anchor-sx').spinner('value', anchor.sx);
			$('#anchor-sy').spinner('value', anchor.sy);
			$('#anchor-sz').spinner('value', anchor.sz);
			
			editScene.anchorUpdatesDisabled = false;
			$('#anchor-details').show();
			
			if(!$('#anchors-show').get(0).checked) { 
				$('#anchors-show').trigger('click');
			}
		} else {
			$('#anchor-details').hide();
		}
		this.updateAnchorPositions();
	},

	anchorCopyValues:function(e){
		var obj = {x:$('#anchor-x').spinner('value'),y:$('#anchor-y').spinner('value'),z: $('#anchor-z').spinner('value'),
				rx:$('#anchor-rx').spinner('value'),ry:$('#anchor-ry').spinner('value'),rz: $('#anchor-rz').spinner('value'),	
				sx:$('#anchor-sx').spinner('value'),sy:$('#anchor-sy').spinner('value'),sz: $('#anchor-sz').spinner('value')};
		
		localStorage.setItem('anchor-copy', JSON.stringify(obj));
		$('#anchor-paste').removeAttr('disabled');					
	},

	anchorPasteValues:function(e){
		var obj = localStorage.getItem('anchor-copy');
		if(!obj) return;
		
		obj = JSON.parse(obj);
		var selRow = $('#anchor-list div.selected');
		var index;
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(11));
		} else {
			return;
		}
		
		var updatedAnchor = _.deepClone(this.doc.frames[this._currentFrame].anchors[index]);
		for(var p in obj){
			updatedAnchor[p] = obj[p];
		}		
		this.updateAnchor(this._currentFrame, index, updatedAnchor);
		selRow.trigger('click');
	},

	anchorCopyValuesToAllFrames:function(e){
		var undoItem = [];
		if(this.doc.frames.length == 1) return;
		
		var selRow = $('#anchor-list div.selected');
		var index;
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(11));
		} else {
			return;
		}
		
		var curValue = this.doc.frames[this._currentFrame].anchors[index];
		for(var i = 0; i < this.doc.frames.length; i++){
			var newVal = _.deepClone(curValue);
			var prevValue = this.doc.frames[i].anchors[index];
			this.doc.frames[i].anchors[index] = newVal;
			undoItem.push({undo:[this.updateAnchor, i, index, prevValue], redo:[this.updateAnchor, i, index, newVal]});
		}
		
		this.addUndo(undoItem);
	},

	anchorParamChanged:function(e, ui){
		if(this.anchorUpdatesDisabled) return;
		var selRow = $('#anchor-list div.selected');
		var index;
		if(selRow.length){
			index = parseInt(selRow.attr('id').substr(11));
		} else {
			return;
		}
		
		var anchor = _.deepClone(this.doc.frames[this._currentFrame].anchors[index]);
		var fld = e.target.id.substr(7);
		if((e.type == 'spinchange' || fld == 'meta') && anchor[fld] != e.target.value){
			anchor[fld] = parseFloat(e.target.value);
			this.updateAnchor(this._currentFrame, index, anchor);
		}
		
		var anchorsChildren = this.anchors.children;
		var degToRad = Math.PI / 180;
		for(var ai = 0; ai < anchorsChildren.length; ai++){
			var anch = anchorsChildren[ai];
			if(anch.uuid == anchor.id){
				anch.position.set($('#anchor-x').spinner('value'),$('#anchor-y').spinner('value'),$('#anchor-z').spinner('value'));
				anch.rotation.set($('#anchor-rx').spinner('value')*degToRad,$('#anchor-ry').spinner('value')*degToRad,$('#anchor-rz').spinner('value')*degToRad);
				anch.scale.set($('#anchor-sx').spinner('value')||1.0,$('#anchor-sy').spinner('value')||1.0,$('#anchor-sz').spinner('value')||1.0);
				break;
			}
		}
	},

	anchorNameChanged:function(e, index, newName){
		if(this.anchorUpdatesDisabled) return;
		
		if(e){
			var selRow = $('#anchor-list div.selected');
			if(selRow.length){
				index = parseInt(selRow.attr('id').substr(11));
			} else {
				return;
			}
			newName = e.target.value;
		}
		var prevName = this.doc.frames[0].anchors[index].name;
		for(var i = 0; i < this.doc.frames.length; i++){ 
			var anchor = this.doc.frames[i].anchors[index];
			anchor.name = newName;
		}
		
		this.addUndo({undo:[this.anchorNameChanged, null, index, prevName],redo:[this.anchorNameChanged, null, index, newName]});
		
		this.refreshAnchors();
	},
	
	updateAnchor:function(frame, index, obj) {
		if(this.anchorUpdatesDisabled) return;
		
		var prevAnchor = this.doc.frames[frame].anchors[index];
		
		this.doc.frames[frame].anchors[index] = obj;
		this.addUndo({undo:[this.updateAnchor, frame, index, prevAnchor], redo:[this.updateAnchor, frame, index, obj]});
		
		this.updateAnchorPositions();
	},


/* ------------------- ------------------- ------------------- ------------------- ------------------- Frames functions */

	/* play / pause */
	framePlay:function(){
		if(editScene.playing) editScene.stop();
		else editScene.play();
	},
	
	/* called to add a frame */
	addFrameAt:function(loc, frameObject){
		var undoItem = [{redo:[this.addFrameAt, loc, frameObject], undo:[this.removeFrameAt, loc ] }];
		
		this.frameRangePaste(null, loc, [ frameObject ] );
	},
	
	/* remove a frame */
	removeFrameAt:function(loc){
		if(this.doc.frames.length == 1 || loc < 0 || loc >= this.doc.frames.length) return;
		
		this.frameRangeDelete(null, loc, 1);
	},
	
	/* duplicate a frame */
	duplicateFrameAt:function(loc){
		var frameObject = this.doc.frames[loc];
		
		// duplicate frame
		var nfo = _.deepClone(frameObject, 1);
				
		this.frameRangePaste(null, loc, [ nfo ] );
	},
	
	/* move frame */
	moveFrame:function(loc, newLoc){
		var undoItem = [{undo:[this.moveFrame, newLoc, loc], redo:[this.moveFrame, loc, newLoc] }];
		
		var frameObject = this.doc.frames[loc];
		this.doc.frames.splice(loc, 1);
		this.doc.frames.splice(newLoc, 0, frameObject);
		
		// thumb
		var f = this.thumbnails[loc];
		this.thumbnails.splice(loc, 1);
		this.thumbnails.splice(newLoc, 0, f);
		
		// model
		this.model.moveFrame(loc, newLoc);
		
		// animations
		if(!this._undoing){
			for(var i = 0; i < this.doc.anims.length; i++){
				var anim = this.doc.anims[i];
				// frame inside this anim
				if(anim.start <= loc && anim.start + anim.length > loc){
					var updatedAnim = _.deepClone(anim);
					updatedAnim.length = Math.max(1, anim.length - 1);
					undoItem.push({redo:[this.updateAnimation, i, updatedAnim], undo:[this.updateAnimation, i, anim] });
					this.doc.anims[i] = updatedAnim;
				} else if(anim.start > loc){
					var updatedAnim = _.deepClone(anim);
					updatedAnim.start = Math.max(0, anim.start - 1);
					undoItem.push({redo:[this.updateAnimation, i, updatedAnim], undo:[this.updateAnimation, i, anim] });
					this.doc.anims[i] = updatedAnim;
				}
			}
			for(var i = 0; i < this.doc.anims.length; i++){
				var anim = this.doc.anims[i];
				// frame inside this anim
				if(anim.start <= newLoc - 1 && anim.start + anim.length > newLoc - 1){
					var updatedAnim = _.deepClone(anim);
					updatedAnim.length++;
					undoItem.push({redo:[this.updateAnimation, i, updatedAnim], undo:[this.updateAnimation, i, anim] });
					this.doc.anims[i] = updatedAnim;
				} else if(anim.start > newLoc - 1){
					var updatedAnim = _.deepClone(anim);
					updatedAnim.start++;
					undoItem.push({redo:[this.updateAnimation, i, updatedAnim], undo:[this.updateAnimation, i, anim] });
					this.doc.anims[i] = updatedAnim;
				}
			}
		}
		
		this.addUndo(undoItem);
		
		this.currentFrame = newLoc;		
		
		this.refreshThumbnails();
	},
	
	/* get current frame */
	get currentFrame() { return this._currentFrame; },
	
	/* set frame and update display */
	set currentFrame(f){
		this._currentFrame = this.playing ? (f % (this.doc.frames.length || 1)) : Math.max(0, Math.min(this.doc.frames.length - 1, f));
		
		$('#current-frame').val(this._currentFrame + 1);
		$('#frame-slider').slider({value: this._currentFrame + 1, max: this.doc.frames.length });
		$('#frame-slider .ui-slider-handle').text(this._currentFrame + 1);
		$('#frame-range-slider').slider('option',{min: 1, max: this.doc.frames.length });
		$('#current-frame,#anim-start').spinner('option', { max: this.doc.frames.length });
		$('#anim-len').spinner('option', { max: this.doc.frames.length - $('#anim-start').spinner('value') + 1 });
		$('#total-frames').text("of "+this.doc.frames.length);
		
		$('#frame-thumbnails img').removeClass('current');
		$('#frame-thumb-'+this._currentFrame).addClass('current');
		
		this.model.frame = this._currentFrame;
		if(!this.playing){
			this.refreshAnchors();
		} else {
			this.updateAnchorPositions();
		}
	},

	/* frame spinner callback */
	frameSpin:function(e){
		editScene.currentFrame = parseInt($(this).val()) - 1;
	},
	
	/* frame slider callback */ 
	frameSlide: function(e, ui){
		editScene.currentFrame = ui.value - 1;
		editScene.blur();
	},

	toggleFrameRange: function(){
		$('#editor-timeline').toggleClass('collapsed');
		var coll = $('#editor-timeline').hasClass('collapsed');
		localStorage.setItem('timeline-show-range', !coll);
		if(coll) { 
			$('#frame-range').hide();
			$('#toggle-range').html('&uArr;');
		} else {
			$('#frame-range').show();
			$('#toggle-range').html('&dArr;');
		}
	},

	/* frame range slider callback */
	frameRangeSlide: function(e, ui){
		editScene.blur();
		
		var handles = $('#frame-range-slider .ui-slider-handle');
		handles.slice(0).text(ui.values[0]);
		handles.slice(1).text(ui.values[1]);		
		var label = '&larr; ' + (ui.values[1] - ui.values[0] + 1) + ' &rarr;';
		$('#frame-range-slider .ui-slider-range').html((ui.values[1] - ui.values[0] > 0) ? label : '');
		
		editScene.updateRangeBackgroundDisplay();
	},
	
	updateRangeBackgroundDisplay:function(){
		var rng = $('#frame-range');
		var values = $('#frame-range-slider').slider('values');
		var f0 = $('#frame-thumb-'+(values[0] - 1));
		var f1 = $('#frame-thumb-'+(values[1] - 1));
		if(f0.length && f1.length){
			var offset0 = f0.offset();
			var offset1 = f1.offset();
			rng.css({left: Math.floor(offset0.left - 10), width: Math.floor(offset1.left + f1.width() - offset0.left)});
		}	
	},

	/* play */
	play:function(){
		editScene.frameAfterPlaying = editScene._currentFrame;
		editScene.playing = setInterval(function(){ editScene.currentFrame++; }, 200);
		var options = { label: "Pause", icons: { primary: "ui-icon-pause" } };
		$('#frame-play').button( "option", options );
		editScene.container.visible = false;
	},

	/* stop */
	stop:function(){
		if(editScene.playing) clearInterval(editScene.playing);
		editScene.currentFrame = editScene.frameAfterPlaying;
		editScene.playing = 0;
		var options = { label: "Play", icons: { primary: "ui-icon-play" } };
		$('#frame-play').button( "option", options );
		editScene.container.visible = true;
	},

	thumbnailClicked:function(e){
		var newFrame = parseInt(e.target.id.substr(12));
		if(editScene.shift) {
			$('#frame-range-slider').slider('values', [Math.min(editScene.currentFrame + 1, newFrame + 1),Math.max(editScene.currentFrame + 1, newFrame + 1)]);
			if($('#editor-timeline').hasClass('collapsed')) editScene.toggleFrameRange();
		}
		editScene.currentFrame = newFrame;
	},

	makeEmptyFrame:function(){
		var fo = new Array(this.doc.width * this.doc.height * this.doc.depth);
		return fo;
	},
	
	frameRangeAll:function(e){
		$('#frame-range-slider').slider('values',[1, this.doc.frames.length]);
	},

	frameRangeCut:function(e){
		this.frameRangeCopy(e);
		this.frameRangeDelete(e);
	},
	
	frameRangeCopy:function(e){
		var vals = $('#frame-range-slider').slider('values');
		var startFrame = vals[0] - 1;
		var endFrame = vals[1];
		
		var copiedFrames = this.doc.frames.slice(startFrame, endFrame);
		var extras = [];
		// gather extended properties separately from Array (because JSON doesn't stringify them)
		for(var f = 0; f < copiedFrames.length; f++){
			var eo = {};
			for(var p in copiedFrames[f]){
				if(isNaN(p)){
					eo[p] = copiedFrames[f][p];
				}
			}
			extras.push(eo);
		}
		
		localStorage.setItem('framePaste', JSON.stringify({f:copiedFrames, e:extras}));
	},

	frameRangePaste:function(e, startFrame, frames){
		if(e){
			frames = localStorage.getItem('framePaste');
			if(frames === null) return;
			
			try { frames = JSON.parse(frames); } catch(e){ return; }
			
			// check size match
			var f0 = frames.f[0];
			if(f0.length != this.doc.frames[0].length) {
				$('body').append('<div id="cant-paste" class="center no-close">\
				Unable to paste frames. Current document and pasted frames dimension/size must match.\
				</div>');
				this.disableCanvasInteractions(true);
				$('#cant-paste').dialog({
			      resizable: false, width: 350, height:260, modal: true, dialogClass:'no-close', title:"Problem",
			      buttons: {
			        Ok: function() { $(this).dialog("close"); }
			      },
			      close: function(){ 
			      	editScene.enableCanvasInteractions(true);
			      	$(this).remove();
			      }
			    });
			    return;
			}
			
			// merge extras
			var extras = frames.e;
			frames = frames.f;
			for(var i = 0; i < frames.length; i++){
				for(var p in extras[i]){ frames[i][p] = extras[i][p]; }
			}
			
			startFrame = this._currentFrame + 1;
		}
		
		// create undo
		var undoItem = [{redo:[this.frameRangePaste, null, startFrame, frames], undo:[this.frameRangeDelete, null, startFrame, frames.length ] }];
		
		// insert frames back
		var len = frames.length;
		var currentAnchors = (this.doc.frames.length ? this.doc.frames[this._currentFrame].anchors : []) || [];
		for(i = startFrame; i < startFrame + frames.length; i++){
			var frame = frames[i - startFrame];
			
			if(frame.anchors == undefined) frame.anchors = [];
			var frameAnchors = frame.anchors;
			
			// normalize anchors in frame
			frame.anchors = _.deepClone(currentAnchors);
			for(var a = 0; a < currentAnchors.length; a++){
				// find anchor in frame
				for(var ai = 0; ai < frameAnchors.length; ai++){
					if(frameAnchors[ai].id == currentAnchors[a].id){
						frame.anchors[a] = frameAnchors[ai];
						frame.anchors[a].name = currentAnchors[a].name; // match name
					}
				}
			}
			
			// insert back
			this.doc.frames.splice(i, 0, frame);
			this.thumbnails.splice(startFrame, 0, {});
			this.model.addFrameAt(i);
			this.model.replaceFrame(this.doc.frames[i], i);
		}
		
		// anims
		if(!this._undoing){
			// animations
			var anims = _.clone(this.doc.anims);
			for(var i = 0; i < anims.length; i++){
				var anim = anims[i];
				var updatedAnim = _.deepClone(anim);
				var origIndex = this.doc.anims.indexOf(anim);
				var animEnd = anim.start + anim.length;
				// startFrame is inside anim
				if(anim.start <= startFrame && animEnd > startFrame){
					updatedAnim.length += frames.length;
					undoItem.push({redo:[this.updateAnimation, origIndex, updatedAnim], undo:[this.updateAnimation, origIndex, anim] });
					this.doc.anims[origIndex] = updatedAnim;
				// anim is after startFrame
				} else if(anim.start > startFrame){
					updatedAnim.start += frames.length;
					undoItem.push({redo:[this.updateAnimation, origIndex, updatedAnim], undo:[this.updateAnimation, origIndex, anim] });
					this.doc.anims[origIndex] = updatedAnim;
				}
			}
		}
				
		this.addUndo(undoItem);

		this.currentFrame = startFrame + frames.length - 1;		
		
		this.refreshThumbnails();
	},

	frameRangeDelete:function(e, startFrame, length){
		if(startFrame === undefined){
			var val = $('#frame-range-slider').slider('values');
			startFrame = val[0] - 1;
			length = val[1] - val[0] + 1;
			
			// check for final size
			if(this.doc.frames.length - length == 0){
				$('body').append('<div id="cant-delete" class="center no-close">\
				Unable to delete all frames. There must be at least one frame remaining.\
				<span class="info">Select a smaller frame range.</span>\
				</div>');
				this.disableCanvasInteractions(true);
				$('#cant-delete').dialog({
			      resizable: false, width: 350, height:260, modal: true, dialogClass:'no-close', title:"Problem",
			      buttons: {
			        Ok: function() { $(this).dialog("close"); }
			      },
			      close: function(){ 
			      	editScene.enableCanvasInteractions(true);
			      	$(this).remove();
			      }
			    });
			    return;
			}
		}
		
		// splice frames
		var frames = this.doc.frames.splice(startFrame, length);
		
		// create undo
		var undoItem = [{redo:[this.frameRangeDelete, null, startFrame, length], undo:[this.frameRangePaste, null, startFrame, frames ] }];
		
		// thumbs
		this.thumbnails.splice(startFrame, length);
		
		// remove model frames
		var len = length;
		while(len){ this.model.removeFrameAt(startFrame); len--; }

		// update animations		
		if(!this._undoing){
			// animations
			var anims = _.clone(this.doc.anims);
			anims.sort(function(a,b){
				if(a.start < b.start) return - 1;
				if(a.start > b.start) return 1;
				if(a.length < b.length) return - 1;
				if(a.length > b.length) return - 1;
				return 0;
			});
			var rangeEnd = startFrame + length;
			for(var i = 0; i < anims.length; i++){
				var anim = anims[i];
				var updatedAnim = _.deepClone(anim);
				var animEnd = anim.start + anim.length;
				var origIndex = this.doc.anims.indexOf(anim);
				// start frame inside this anim
				if(anim.start <= startFrame && startFrame < animEnd){
					// range end is inside this anim
					if(rangeEnd <= animEnd){
						updatedAnim.length -= length;
					// range end is outside this anim
					} else {
						updatedAnim.length = startFrame - anim.start;
					}
					// anim updated
					if(updatedAnim.length > 0){
						undoItem.push({redo:[this.updateAnimation, origIndex, updatedAnim], undo:[this.updateAnimation, origIndex, anim] });
						this.doc.anims[origIndex] = updatedAnim;
					// anim removed
					} else {
						undoItem.push({redo:[this.animDelete, null, origIndex], undo:[this.animInsert, origIndex, anim] });
						this.doc.anims.splice(origIndex, 1);
					}
				// start frame is before anim start, end frame is after
				} else if(anim.start >= startFrame && animEnd <= rangeEnd){
					// delete anim
					undoItem.push({redo:[this.animDelete, null, origIndex], undo:[this.animInsert, origIndex, anim] });
					this.doc.anims.splice(origIndex, 1);
				// delete end frame falls inside anim
				} else if(rangeEnd > anim.start && rangeEnd <= animEnd){
					updatedAnim.start = startFrame;
					updatedAnim.length -= rangeEnd - anim.start;
					undoItem.push({redo:[this.updateAnimation, origIndex, updatedAnim], undo:[this.updateAnimation, origIndex, anim] });
					this.doc.anims[origIndex] = updatedAnim;
				// anim after delete range
				} else if(rangeEnd <= anim.start){
					updatedAnim.start -= length;
					undoItem.push({redo:[this.updateAnimation, origIndex, updatedAnim], undo:[this.updateAnimation, origIndex, anim] });
					this.doc.anims[origIndex] = updatedAnim;
				}
			}
			
			$('#frame-range-slider').slider('values',[startFrame - 1, startFrame - 1]);
		}
		
		this.addUndo(undoItem);

		this.currentFrame = startFrame;		
		
		this.refreshThumbnails();
	},
	
	frameRangeReverse:function(e, startFrame, endFrame){
		if(e){
			var vals = $('#frame-range-slider').slider('values');
			startFrame = vals[0] - 1;
			endFrame = vals[1] - 1;
		}
		if(startFrame == endFrame) return;
		this.addUndo({undo:[this.frameRangeReverse, null, startFrame, endFrame], redo:[this.frameRangeReverse, null, startFrame, endFrame]});
		
		// reverse frames
		var half = Math.floor((endFrame - startFrame) * 0.5);
		for(var i = 0; i < half; i++){
			// swap frames
			var obj = this.doc.frames[startFrame + i];
			this.doc.frames[startFrame + i] = this.doc.frames[endFrame - i];
			this.doc.frames[endFrame - i] = obj;
			// swap model frames
			this.model.swapFrames(startFrame + i, endFrame - i);
			// swap thumbs
			obj = this.thumbnails[startFrame + i];
			this.thumbnails[startFrame + i] = this.thumbnails[endFrame - i];
			this.thumbnails[endFrame - i] = obj;
		}		
		
		this.refreshThumbnails();
		
		// refresh frame
		var cf = this._currentFrame;
		this._currentFrame = -1;
		this.currentFrame = cf;
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Document functions */

	/* resize document */
	resizeDoc:function(e, preX, preY, preZ, addX, addY, addZ){
		if(e){
			$('body').append('<div id="resize-doc" class="center no-close">\
			<label for="res-pre-x" class="w2 right-align">Pre X</label><input id="res-pre-x" size="3"/><label for="res-post-x" class="w2 right-align">Post X</label><input id="res-post-x" size="3"/><br/>\
			<label for="res-pre-y" class="w2 right-align">Pre Y</label><input id="res-pre-y" size="3"/><label for="res-post-y" class="w2 right-align">Post Y</label><input id="res-post-y" size="3"/><br/>\
			<label for="res-pre-z" class="w2 right-align">Pre Z</label><input id="res-pre-z" size="3"/><label for="res-post-z" class="w2 right-align">Post Z</label><input id="res-post-z" size="3"/><br/>\
			<span class="info">This operation is not undo-able<br/>PRE X,Y,Z pad pixels from origin<br/>POST X,Y,Z add pixels to the outside<br/>Final size is Pre + origsize + Post</span>\
			</div>');
			$('#res-pre-x').val(-this.maskPosition.x);
			$('#res-pre-y').val(-this.maskPosition.y);
			$('#res-pre-z').val(-this.maskPosition.z);
			$('#res-post-x').val((this.maskPosition.x + this.maskSize.x) - this.doc.width);
			$('#res-post-y').val((this.maskPosition.y + this.maskSize.y) - this.doc.height);
			$('#res-post-z').val((this.maskPosition.z + this.maskSize.z) - this.doc.depth);			
		    $('#resize-doc input').spinner({min: -128, max: 128, step: 1 });
	      	editScene.disableCanvasInteractions(true);
			$('#resize-doc').dialog({
			      resizable: false, width: 350, height:380, modal: true, dialogClass:'no-close', title:"Resize",
			      buttons: {
			        "Resize": function() {
			          editScene.resizeDoc(null, 
			          	$('#res-pre-x').spinner('value'),$('#res-pre-y').spinner('value'),$('#res-pre-z').spinner('value'),
			          	$('#res-post-x').spinner('value'),$('#res-post-y').spinner('value'),$('#res-post-z').spinner('value'));
			          $(this).dialog("close");
			        },
			        Cancel: function() {
			          $(this).dialog("close");
			        }
			      },
			      close: function(){ 
			      	editScene.enableCanvasInteractions(true);
			      	$(this).remove();
			      }
			    });
		} else {
			var newWidth = this.doc.width + addX + preX;
			var newHeight = this.doc.height + addY + preY;
			var newDepth = this.doc.depth + addZ + preZ;
			
			// resize frames
			for(var i = 0; i < this.doc.frames.length; i++){
				var frame = this.doc.frames[i];
				var newFrame = _.deepClone(frame, 10);
				
				newFrame.length = 0; // truncate
				newFrame.length = newWidth * newHeight * newDepth;
				
				// copy pixels
				for(var x = 0; x < this.doc.width; x++){
				for(var y = 0; y < this.doc.height; y++){
				for(var z = 0; z < this.doc.depth; z++){
					var addr = x * this.doc.height * this.doc.depth + y * this.doc.depth + z;
					var xx = x + preX, yy = y + preY, zz = z + preZ;
					if(xx < 0 || xx > newWidth || yy < 0 || yy > newHeight || zz < 0 || zz > newDepth) continue; //OOB
					
					// copy pixel
					var newAddr = xx * newHeight * newDepth + yy * newDepth + zz;
					newFrame[newAddr] = frame[addr];
				}}}
				
					// offset all anchors
					for(var ai in newFrame.anchors){
						var anchor = newFrame.anchors[ai];
						anchor.x += preX; anchor.y += preY; anchor.z += preZ;
					}

				this.doc.frames[i] = newFrame;
			}
			
			this.doc.width = newWidth;
			this.doc.height = newHeight;
			this.doc.depth = newDepth;
			
			this.createContainer();
			
			// repopulate frames
			for(var i = 0; i < this.doc.frames.length; i++){
				this.thumbnails[i] = {};
				var frame = this.doc.frames[i];
				this.model.addFrameAt(i);
				this.model.replaceFrame(frame, i);
			}

			this.maskingModeChange();
			this.maskReset();

			this.refreshThumbnails();
			this._currentFrame = -1;
			this.currentFrame = 0;
		}
	},

	/* clear localStore */
	resetLocalStorage:function(){
		$('<div id="editor-reset" class="editor">\
		<div class="center">This will reset the editor\'s stored preferences and stored "Hold" object.</div>\
		</div>').dialog({
	      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Reset LocalStorage?",
	      buttons: { 
	      "Cancel": function() { 
	      	$(this).dialog("close"); 
	      },
	      "Reset": function() { 
	      	localStorage.clear();
	      	window.location.reload();
	      	$(this).dialog("close"); 
	      } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		editScene.disableCanvasInteractions(true);
	},
	
	/* store localStore */
	holdDoc:function(){	
		function doHold(){
			if(editScene.pasteMode) editScene.completePaste();
			var data = editScene.createDataObject({ 
					name: editScene.doc.name,
					optimize: editScene.doc.optimize, 
					floor: editScene.doc.floor,
					smoothNormals: editScene.doc.smoothNormals,
					occlusion: editScene.doc.occlusion,
					pointSize: editScene.doc.pointSize
				});
			data = JSON.stringify(data);
			localStorage.setItem('holdDoc', data);
		}
		
		if(localStorage.getItem('holdDoc')){
			$('<div id="editor-hold" class="editor">\
			<div class="center">This will replace current "Hold" object.</div>\
			</div>').dialog({
		      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Replace Hold?",
		      buttons: { 
		      "Cancel": function() { 
		      	$(this).dialog("close"); 
		      },
		      "Replace": function() { 
		      	doHold();
		      	$(this).dialog("close"); 
		      } },
		      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
			});
			editScene.disableCanvasInteractions(true);
		} else doHold();
	},
	
	/* restore */
	fetchDoc:function(){
		var data = localStorage.getItem('holdDoc');
		if(!data) return;
		
		$('<div id="editor-reset" class="editor">\
		<div class="center">Ths will replace current object with the ones stored in "Hold".</div>\
		</div>').dialog({
	      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Restore from Hold?",
	      buttons: { 
	      "Cancel": function() { 
	      	$(this).dialog("close"); 
	      },
	      "Restore": function() {
	      	if(editScene.pasteMode) editScene.cancelPaste();
	      	editScene.newDocFromData(JSON.parse(data));
	      	$(this).dialog("close"); 
	      } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		editScene.disableCanvasInteractions(true);
	},

	/* export doc */
	saveDoc:function(){
		if(editScene.playing) editScene.stop();
		
		function refresh(e){
			if(e.target.id == 'save-name') editScene.doc.name = $('#save-name').val();
			editScene.doc.name = (editScene.doc.name && editScene.doc.name.length) ? editScene.doc.name : null;
			
			localStorage.setItem('save-compress', $('#save-compress').get(0).checked);
			localStorage.setItem('save-raw', $('#save-raw').get(0).checked);
			
			var data = editScene.createDataObject({ 
				name: editScene.doc.name,
				floor: editScene.doc.floor, 
				optimize: editScene.doc.optimize, 
				smoothNormals: editScene.doc.smoothNormals,
				occlusion: editScene.doc.occlusion,				
				pointSize: editScene.doc.pointSize
			}, $('#save-raw').get(0).checked);
			
			if($('#save-compress').get(0).checked) { 
				data = JSON.stringify(data);
				data = LZString.compressToBase64(data);
			} else {
				data = JSON.stringify(data);
			}
			$('#save-size').text(data.length + ' chars');
			$('#editor-save textarea').text(data);
		};

		
		$('<div id="editor-save" class="editor">\
		<label for="save-name" class="pad5 w2">Name&nbsp;&nbsp;</label><input type="text" class="w4" id="save-name"/>\
		&nbsp;&nbsp;&nbsp;<button id="save-select">Select All</button>\
		<hr/>\
		<textarea readonly="readonly"></textarea>\
		<hr/>\
		<label for="save-compress" class="pad5">LZString - compress&nbsp;&nbsp;</label><input type="checkbox" id="save-compress"/>\
		<span id="save-size" class="flush-right">chars</span><br/>\
		<label for="save-raw" class="pad5">Raw (faster loading, bigger file)&nbsp;&nbsp;</label><input type="checkbox" id="save-raw"/>\
		<span class="info">Copy and paste above into a file</span>\
		</div>').dialog({
	      resizable: false, width: 400, height:470, modal: true, dialogClass:'no-close', title:"Export Data",
	      buttons: { OK: function() { $(this).dialog("close"); } },
	      open: refresh,
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		
		$('#save-name').val(editScene.doc.name).change(refresh);
		$('#save-compress').change(refresh).get(0).checked = (localStorage.getItem('save-compress') == 'true');
		$('#save-raw').change(refresh).get(0).checked = (localStorage.getItem('save-raw') == 'true');
		$('#save-select').button().click(function(){ $('#editor-save textarea').get(0).select();});
		editScene.disableCanvasInteractions(true);
	},

	/* export doc */
	loadDoc:function(){
		if(editScene.playing) editScene.stop();
		
		$('<div id="editor-load" class="editor">\
		<span class="info">Paste data below</span>\
		<textarea></textarea>\
		</div>').dialog({
	      resizable: false, width: 400, height:400, modal: true, dialogClass:'no-close', title:"Import Data",
	      buttons: { 
	      	"Import": function() {
	      		// parse
	      		var data = $('#editor-load textarea').val();
	      		if(!data.length) return;
	      		
	      		var err = null;
	      		if(data.substr(0,1) != '{'){
	      			try {
	      				data = LZString.decompressFromBase64(data);
	      				if(!data) throw 1;
	      			} catch(e) {
	      				err = "Unable to LZString decompress string";
	      			}
	      		}
	      		
	      		if(!err){
	      			try {
	      				data = JSON.parse(data);
	      			} catch(e){ err = "Unable to parse JSON"; console.error(e); }
	      		}
	      		
	      		if(err){
		      		$('#editor-load span').removeClass('info').addClass('error').text(err);
		      	} else {
		      		$(this).dialog("close");
		      		console.log('Parsed ', data);
		      		// load data
		      		editScene.newDocFromData(data);
		      	}
	      	},
	      	"Cancel": function() { 
	      		$(this).dialog("close"); 
	      	},
	      },	      
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		
		editScene.disableCanvasInteractions(true);
	},

	/* new document */
	newDoc:function(w,h,d){
		if(this.playing) this.stop();
		if(this._pasteMode) this.cancelPaste();
		
		if(arguments.length == 3){
			w = Math.abs(w || 8); localStorage.setItem('new-width', w);
			h = Math.abs(h || 8); localStorage.setItem('new-height', h);
			d = Math.abs(d || 8); localStorage.setItem('new-depth', d);
			
			// new doc
			this.doc = { 
				name: "new pixelbox", 
				width: w, height: h, depth: d,
				floor: false,
				optimize: (localStorage.getItem('doc-optimize') != null ? localStorage.getItem('doc-optimize') : true),
				smoothNormals: (localStorage.getItem('doc-smooth') != null ? localStorage.getItem('doc-smooth') : 1.0),
				occlusion: (localStorage.getItem('doc-occlusion') != null ? localStorage.getItem('doc-occlusion') : 1.0),
				pointSize: 1.0,
				frames:[],
				anims:[]
			};
			
			this.thumbnails.length = 0;
			
			this.maskPosition = new THREE.Vector3();
			this.maskSize = new THREE.Vector3(w,h,d);
			
			this.createContainer();
			
			this.addFrameAt(0, this.makeEmptyFrame());
			this.initUndo();
			this.currentFrame = 0;
			$('#frame-range-slider').slider('option',{ min: 1, max: 1}).slider('values', [1, 1]);
			
			setTimeout(this.resetZoom.bind(this), 500);
		} else {
			if(!$('#new-doc').length){
				$('body').append('<div id="new-doc" class="center no-close">\
				<label for="new-width" class="w2 right-align">Width</label><input id="new-width" name="new-width" size="3"/><br/>\
				<label for="new-height" class="w2 right-align">Height</label><input id="new-height" name="new-height" size="3"/><br/>\
				<label for="new-depth" class="w2 right-align">Depth</label><input id="new-depth" name="new-depth" size="3"/><br/>\
				<span class="info">Size must be between<br/>4 and 256</span>\
				</div>');
			    $('#new-width,#new-height,#new-depth').spinner({min: 4, max: 256, step: 4 });
			}
	      	editScene.disableCanvasInteractions(true);
			$('#new-doc').dialog({
			      resizable: false, width: 250, height:360, modal: true, dialogClass:'no-close', title:"Create New",
			      buttons: {
			        "Create": function() {
			          editScene.newDoc($('#new-width').val(), $('#new-height').val(), $('#new-depth').val());
			          $(this).dialog("close");
			        },
			        Cancel: function() {
			          $(this).dialog("close");
			        }
			      },
			      close: function(){ 
			      	editScene.enableCanvasInteractions(true);
			      	$(this).remove();
			      }
			    });
			$('#new-width').val(localStorage.getItem('new-width') || 8);
		    $('#new-height').val(localStorage.getItem('new-height') || 8);
		    $('#new-depth').val(localStorage.getItem('new-depth') || 8);
	    }
	},

	/* imports frames from JSON'ed object */
	newDocFromData:function(dataObject){
	
		// init new document
		this.newDoc(dataObject.width, dataObject.height, dataObject.depth);
		for(var pname in dataObject){
		// copy all props except frames
			if(pname != 'frames'){
				this.doc[pname] = _.deepClone(dataObject[pname]);
			}
		}
		
		var animations = this.doc.anims;
		this.doc.anims = [];
		var anchors = dataObject.anchors || {};
		var anchorIds = {};
		var isRaw = (typeof(dataObject.frames[0]) == 'object');
		var tempColor = new THREE.Color();
		var tempVec = new THREE.Vector3();
		// parse frames
		for(var frameIndex = 0; frameIndex < dataObject.frames.length; frameIndex++){
			var frameData = dataObject.frames[frameIndex];
			var prevFrameData = null;
			var isDeltaFormat = frameIndex > 0;
			var assembledFrameData = [];
			if(isRaw){
				assembledFrameData.length = dataObject.width * dataObject.depth * dataObject.height;
				for(var i = 0; i < frameData.o.length; i++){
					var x = frameData.p[i * 3] + dataObject.width * 0.5;
					var y = frameData.p[i * 3 + 1] + dataObject.height * 0.5;
					var z = frameData.p[i * 3 + 2] + dataObject.depth * 0.5;
					var addr = x * dataObject.depth * dataObject.height + y * dataObject.depth + z;
					tempColor.setRGB(frameData.c[i * 4],frameData.c[i * 4 + 1],frameData.c[i * 4 + 2]);
					tempVec.set(frameData.n[i * 3], frameData.n[i * 3 + 1], frameData.n[i * 3 + 2]);
					assembledFrameData[addr] = { c: tempColor.getHex(), a: frameData.c[i * 4 + 3], b: Math.max(0, tempVec.length() - 1.0) };
				}
			} else {
				if(isDeltaFormat){
					frameData = frameData.match(/.{14}/g);
					prevFrameData = dataObject.frames[frameIndex - 1];
				} else {
					frameData = frameData.match(/.{8}/g);
				}
				if(frameData === null) frameData = [];
				var chunk, temp, normal, pixel, optimizeRemoved = 0, index = 0;
				var colorObj = new THREE.Color();
			
				// decode and assemble current frame
				for(var x = 0; x < dataObject.width; x++){
				for(var y = 0; y < dataObject.height; y++){
				for(var z = 0; z < dataObject.depth; z++){
					// delta
					if(isDeltaFormat){
						pixel = prevFrameData[index];
						pixel = { c: pixel.c, a: pixel.a, b: pixel.b }; // copied
						assembledFrameData.push(pixel);
					// full format	
					} else {
						// parse pixel
						chunk = frameData[index];
						pixel = { 
							c: parseInt(chunk.substr(0, 6), 16), 
							a: parseInt(chunk.substr(6, 1), 16) / 15.0, 
							b: parseInt(chunk.substr(7, 1), 16) / 15.0
						};
						assembledFrameData.push(pixel);
					}
				
					index++;
				}}}
				
				if(isDeltaFormat){
					for(index = 0; index < frameData.length; index++){
						chunk = frameData[index];
						temp = parseInt(chunk.substr(0,6), 16);
						assembledFrameData[temp] = {
							c: parseInt(chunk.substr(6,6), 16),
							a: parseInt(chunk.substr(12,1), 16) / 15.0,
							b: parseInt(chunk.substr(13,1), 16) / 15.0
						};						
					}
				}
			}
			
			// update dataObject with decoded frame data
			dataObject.frames[frameIndex] = assembledFrameData;
			
			// ready to add pixels
			index = 0;
			var color, opacity, brightness;
			var addPixels = [];
			
			for(var x = 0; x < dataObject.width; x++){
			for(var y = 0; y < dataObject.height; y++){
			for(var z = 0; z < dataObject.depth; z++){
			
				if(!assembledFrameData[index] || assembledFrameData[index].a == 0.0) { 
					index++;
					continue;
				}

				var newPixel = this.makePixel(x, y, z, new THREE.Color(assembledFrameData[index].c), assembledFrameData[index].a, assembledFrameData[index].b);
				addPixels.push([ index, newPixel ]);
				index++;	
			}}}
				
			if(frameIndex) this.addFrameAt(frameIndex, this.makeEmptyFrame());
			this.replacePixels(frameIndex, addPixels);
			
			// process anchors
			var ai = 0;
			for(var aname in anchors){
				var anchorFrames = anchors[aname];
				if(!anchorIds[aname]) anchorIds[aname] = THREE.Math.generateUUID();
				var obj = _.deepClone(anchorFrames[frameIndex]);
				obj.name = aname;
				obj.id = anchorIds[aname];
				if(frameIndex){
					this.doc.frames[frameIndex].anchors[ai] = obj;
				} else {
					if(!this.doc.frames[frameIndex].anchors) this.doc.frames[frameIndex].anchors = [ obj ];
					else this.doc.frames[frameIndex].anchors.push(obj);
				}
				ai++;
			}
			
		} // end parse frames
		
		// put anims back in
		this.doc.anims = animations;
		
		// clear undo queue
		this.initUndo();
		this.resetZoom();
		this.currentFrame = 0;
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Undo functions */

	/* undo queue */
	initUndo:function(){
		this._undoing = false;
		this._undo = [];
		this._redo = [];
		this.undoChanged();
	},
	
	undoChanged:function(){
		$('#undo').button({label:"Undo" + (this._undo.length ? (' ('+this._undo.length+')') : ''), disabled: !this._undo.length});
		$('#redo').button({label:"Redo" + (this._redo.length ? (' ('+this._redo.length+')') : ''), disabled: !this._redo.length});
	},
	
	/* add undo item: { undo:[function, args . . .], redo:[function, args . . .] } */
	addUndo:function(item){
		if(this.playing) this.stop();
	
		if(!this._undoing){
			this._undo.push(item);
			this._redo.length = 0;
			this.undoChanged();
			
			// limit undo buffer size
			if(this._undo.length > 100){
				this._undo.splice(0, 1);
			}
		}	
	},
	performUndo:function(){
		if(editScene.pasteMode) { 
			editScene.cancelPaste();
			return;
		}
		if(this.stroking || this.movingMask) return;
		if(this._undo.length){
			var item = this._undo.pop();
			this._redo.push(item);
			this._undoing = true;
			if(item instanceof Array){
				for(var i = item.length - 1; i >= 0; i--){
					var uitem = item[i];
					uitem.undo[0].apply(editScene, uitem.undo.slice(1));				
				}
			} else {
				item.undo[0].apply(editScene, item.undo.slice(1));
			}
			this._undoing = false;
			this.undoChanged();
			this.currentFrame = this._currentFrame;
		}
	},
	performRedo:function(){
		if(editScene.pasteMode) editScene.cancelPaste();
		if(this.stroking || this.movingMask) return;
		if(this._redo.length){
			var item = this._redo.pop();
			this._undo.push(item);
			this._undoing = true;
			if(item instanceof Array){
				for(var i = 0; i < item.length; i++){
					var uitem = item[i];
					uitem.redo[0].apply(editScene, uitem.redo.slice(1));				
				}
			} else {
				item.redo[0].apply(editScene, item.redo.slice(1));
			}
			this._undoing = false;
			this.undoChanged();
			this.currentFrame = this._currentFrame;
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- UI functions */

	/* create main editor UI*/
	addUI:function(){
	// menu bar
		$('body').append(
		'<div id="menu-bar" class="absolute-pos upper-left editor">\
		<ul class="horizontal"><li>\
		<a id="file">File</a></li><li><a id="edit">Edit</a></li><li><a id="view">View</a></li><li><a id="help">Help</a></li></ul>\
		</div>\
		<ul class="editor absolute-pos submenu shortcuts" id="file-submenu">\
			<li id="file-new">New <em><span class="ctrl"/>Ctrl + N</em></li>\
			<hr/>\
			<li id="file-resize">Resize</li>\
			<hr/>\
			<li id="file-load">Import</li>\
			<li id="file-save">Export</li>\
			<hr/>\
			<li id="file-hold">Hold</li>\
			<li id="file-fetch">Fetch</li>\
			<hr/>\
			<li id="file-reset">Reset editor</li>\
			<!--<hr/>\
			<li id="file-exit">Exit to Main Menu</li>-->\
		</ul>\
		<ul class="editor absolute-pos submenu shortcuts" id="edit-submenu">\
			<li id="edit-cut">Cut <em><span class="ctrl"/>X</em></li>\
			<li id="edit-copy">Copy <em><span class="ctrl"/>C</em></li>\
			<li id="edit-paste">Paste <em><span class="ctrl"/>V</em></li>\
			<hr/>\
			<li id="edit-fill">Fill selection <em>F</em></li>\
			<li id="edit-clear">Clear selection <em>Delete</em></li>\
			<hr/>\
			<li id="edit-ball">Add sphere</li>\
		</ul>\
		<ul class="editor absolute-pos submenu" id="view-submenu">\
			<li id="bg-floor"><input type="checkbox" id="bg-show-floor" '+(editScene.shadowPreviewPlane.visible ? 'checked="checked"':'')+'>Show floor plane</li>\
			<li id="bg-color">Background color</li>\
			<hr/>\
			<li id="reset-zoom">Reset zoom</li>\
		</ul>\
		<div class="editor absolute-pos upper-right pad5">\
			<button id="redo">Redo</button>&nbsp;\
			<button id="undo">Undo</button>\
		</div>');
		
		// file menu
		$('#file').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			$('#file-submenu').css(pos).show();
		});
		$('#file-new').click(editScene.newDoc.bind(editScene));
		$('#file-resize').click(editScene.resizeDoc.bind(editScene));
		$('#file-load').click(editScene.loadDoc);
		$('#file-save').click(editScene.saveDoc);
		$('#file-exit').click(function(){ ui.mainMenu(); });
		$('#file-reset').click(editScene.resetLocalStorage);
		$('#file-hold').click(editScene.holdDoc);
		$('#file-fetch').click(editScene.fetchDoc);
		$('#file-submenu').menu().hide();

	// edit menu
		$('#edit').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			$('#edit-submenu').css(pos).show();
		});
		$('#edit-submenu').menu().hide();
		$('#edit-fill').click(editScene.fillBox.bind(editScene));
		$('#edit-ball').click(editScene.fillBall.bind(editScene));
		$('#edit-clear').click(editScene.fillBox.bind(editScene));
		$('#edit-copy').click(editScene.copySelection.bind(editScene));
		$('#edit-cut').click(editScene.cutSelection.bind(editScene));
		$('#edit-paste').click(editScene.pasteSelection.bind(editScene));
		
		// view menu
		$('#view').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			
			$('#view-submenu').css(pos).show();
			
			$('#bg-show-floor').get(0).checked = editScene.shadowPreviewPlane.visible;
			
			var c = new THREE.Color(editScene.clearColor);
			$('#bg-color').colpick({
				colorScheme:'dark',
				color: {r:c.r * 255, g:c.g * 255, b:c.b * 255},
				submit:0,
				onChange:function(hsb, hex, rgb){ 
					localStorage.setItem('editor-bg-color', hex);
					editScene.clearColor = parseInt(hex,16);					
				},
			}).css({zIndex: 1000});
		});
		$('#bg-floor').click(editScene.toggleShowFloor);
		$('#reset-zoom').click(editScene.resetZoom.bind(editScene));
		$('#view-submenu').menu().hide();
		
	// help menu
		$('#help').click(editScene.showHelp);
	
	// frames toolbar
		$('body').append(
		'<div id="editor-toolbar" class="ui-widget-header ui-corner-all editor floating-panel"><h1>Frame</h2>\
		  <button id="frame-beginning">First Frame</button>\
		  <button id="frame-rewind">Previous Frame</button>\
		  <button id="frame-play">Play</button>\
		  <input id="current-frame" size="3" class="center"/><label id="total-frames" for="current-frame" class="w1"> of '+editScene.doc.frames.length+'</label>\
		  <button id="frame-forward">Next Frame</button>\
		  <button id="frame-end">Last Frame</button>\
		  <span class="separator-left"/>\
		  <button id="frame-ops">Frame Range</button>\
		  <hr/>\
		  <label> Frame </label>\
		  <button id="frame-insert">Add</button>\
		  <button id="frame-clone">Dupe</button>\
		  <span class="separator-left"/>\
		  <button id="frame-move-left">Move Left</button>\
		  <button id="frame-move-right">Move Right</button>\
		  <span class="separator-right"/>\
		  <button id="frame-delete">Delete</button>\
		  </div>\
  		  <ul id="frame-ops-menu" class="editor submenu absolute-pos shortcuts"><li id="frames-all">Select All</li><hr/>\
  		  <li id="frames-cut">Cut<em>Shift + <span class="ctrl"/>X</em></li><li id="frames-copy">Copy<em>Shift + <span class="ctrl"/>C</em></li>\
  		  <li id="frames-paste">Paste <em>Shift + <span class="ctrl"/>V</em></li><hr/><li id="frames-delete">Delete</li><li id="frames-reverse">Reverse</li></ul>');
		
		$('body').append(
		'<div id="editor-timeline" class="editor collapsed">\
		<span id="thumb-options" class="scale75"><a id="thumb-persp">'+(editScene.thumbnailCameraUserAngle ? 'cam angle' : '3/4 view')+'</a><span class="separator-left"/><a id="rethumb">redraw thumbs</a></span>\
		<div id="timeline-container">\
		<div id="frame-thumbnails">\
		<div id="frame-range" style="display:none;"/>\
		</div>\
		<div id="frame-range-slider"></div>\
		<div id="frame-slider"></div>\
		</div>\
		<a id="toggle-range" class="scale75">&uArr;</a>\
		</div>');
		
		$('#frame-slider').slider({min: 1, max: editScene.doc.frames.length, step: 1, slide: editScene.frameSlide });
		$('#frame-slider .ui-slider-handle').text('1');
		$('#frame-range-slider').slider({range:true, min: 1, max: editScene.doc.frames.length, step: 1, slide: editScene.frameRangeSlide, change:editScene.frameRangeSlide});
		$('#frame-range-slider').slider('values', [1, 1]);		
		$('#toggle-range').click(editScene.toggleFrameRange.bind(editScene));
		$("#frame-beginning" ).button({ text: false, icons: { primary: "ui-icon-seek-start" } }).click(function(){editScene.currentFrame = 0;});
		$("#frame-rewind" ).button({ text: false, icons: { primary: "ui-icon-seek-prev" } }).click(function(){editScene.currentFrame--;});
		$("#frame-play" ).button({ text: false, icons: { primary: "ui-icon-play" } }).click(editScene.framePlay);
	    $("#frame-forward" ).button({ text: false, icons: { primary: "ui-icon-seek-next" } }).click(function(){editScene.currentFrame++;});
	    $("#frame-end" ).button({ text: false, icons: { primary: "ui-icon-seek-end" } }).click(function(){editScene.currentFrame = editScene.doc.frames.length;});
	    $('#current-frame').val(1).spinner({min:1, max:editScene.doc.frames.length, step:1, change: editScene.frameSpin, stop: editScene.frameSpin });
	    
	    $('#frame-ops').button({icons:{secondary:'ui-icon-triangle-1-n'}}).click(function(){
			if($('#editor-timeline').hasClass('collapsed')) this.toggleFrameRange();
		    $('#frame-ops-menu').show().position({
	            at: "right top",
	            my: "right bottom",
	            of: this
	          });
          return false;
	    })
	    $('#frame-ops-menu').hide().menu();
	    $('#frames-all').click(editScene.frameRangeAll.bind(editScene));
	    $('#frames-cut').click(editScene.frameRangeCut.bind(editScene));
	    $('#frames-copy').click(editScene.frameRangeCopy.bind(editScene));
	    $('#frames-paste').click(editScene.frameRangePaste.bind(editScene));
	    $('#frames-reverse').click(editScene.frameRangeReverse.bind(editScene));
	    $('#frames-delete').click(editScene.frameRangeDelete.bind(editScene));
	    
		$('#frame-insert').button().click(function(){ editScene.addFrameAt(editScene.currentFrame + 1, editScene.makeEmptyFrame()); });
		$('#frame-clone').button().click(function(){ editScene.duplicateFrameAt(editScene.currentFrame); });
		$('#frame-move-left').button().click(function(){ 
			if(editScene.currentFrame) { editScene.moveFrame(editScene.currentFrame, editScene.currentFrame - 1); }});
		$('#frame-move-right').button().click(function(){ 
			if(editScene.currentFrame < editScene.doc.frames.length - 1) { editScene.moveFrame(editScene.currentFrame, editScene.currentFrame + 1); }});
		$('#frame-delete').button().click(function(){ editScene.removeFrameAt(editScene.currentFrame); });
		$('#rethumb').click(function(){ editScene.updateThumbnailCamera(); editScene.thumbnails = new Array(editScene.doc.frames.length); editScene.refreshThumbnails(); });
		$('#thumb-persp').click(editScene.toggleThumbnailCamera.bind(editScene));
		
		var coll = localStorage.getItem('editor-toolbar-collapsed'); if(coll == 'true') $('#editor-toolbar').addClass('collapsed');
		coll = localStorage.getItem('timeline-show-range');
		if(coll === 'true') { 
			$('#editor-timeline').removeClass('collapsed');
			$('#toggle-range').html('&dArr;');
			$('#frame-range').css({ display: 'block' });
		}
		var savePosOnDrop = function(e, ui) { localStorage.setItem(ui.helper.context.id + '-x', ui.position.left); localStorage.setItem(ui.helper.context.id + '-y', ui.position.top); };
		var bringToFront = function(e, ui){ $('body').append(ui.helper.context); }
		var dw = $('#editor-toolbar').width();
		var dh = $('#editor-toolbar').height();
		var dx = localStorage.getItem('editor-toolbar-x');
		var dy = localStorage.getItem('editor-toolbar-y');
		dx = Math.min((dx === null) ? (window.innerWidth - dw) * 0.5 : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (window.innerHeight - dh - 20) : dy, window.innerHeight - dh);
		$('#editor-toolbar')
			.offset({left:dx, top: dy})
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
		
	// stroke
		$('body').append(
		'<div id="editor-stroke" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Paint</h1>\
		<hr/>\
		<input type="checkbox" id="stroke-contig" '+(editScene.checkContiguous ? 'checked="checked"' : '')+'/><label for="stroke-contig">Cont</label>\
		<input type="checkbox" id="stroke-fill" '+(editScene._fillMode ? 'checked="checked"' : '')+'/><label for="stroke-fill">Fill</label>\
		<span class="separator-left"/>\
		<label>Size&nbsp;&nbsp;&nbsp;&nbsp;</label><div id="stroke-size"/>\
		<hr/>\
		<label class="w3 right-align pad5">Paint &alpha;&nbsp;</label><div id="paint-alpha" class="w5"/><br/>\
		<hr/>\
		<div id="stroke-color"/>\
		<hr/>\
		<label class="w3 right-align pad5">Opacity&nbsp;</label><div id="stroke-opacity" class="w5"/><br/>\
		<hr/>\
		<label class="w3 right-align pad5">Glow&nbsp;</label><div id="stroke-brightness" class="w5"/>\
		</div>');

		$('#stroke-contig').button().click(editScene.checkContiguousChanged);
		$('#stroke-fill').button().click(editScene.fillModeChanged);
		$('#stroke-size').slider({min: 1, max: 4, step: 1, value: 1, slide: editScene.strokeSizeChanged });
		$('#stroke-size').slider('value',editScene.strokeSize);
		$('#stroke-size .ui-slider-handle').text(Math.floor(editScene.strokeSize));
		$('#stroke-color').colpick({ flat: true, 
			color: {r: editScene.strokeColor.r * 255, g: editScene.strokeColor.g * 255, b: editScene.strokeColor.b * 255 }, 
			colorScheme: 'dark', submit: false,
			onChange:editScene.strokeColorChanged } );	
		$('#paint-alpha').slider({min: 0, max: 100, step: 5, value: 100, slide: editScene.paintAlphaChanged });
		$('#paint-alpha .ui-slider-handle').text('100');
		$('#stroke-opacity').slider({min: 0, max: 100, step: 5, value: 100, slide: editScene.strokeOpacityChanged });
		$('#stroke-opacity .ui-slider-handle').text('100');
		$('#stroke-brightness').slider({min: 0, max: 100, step: 5, value: 0, slide: editScene.strokeBrightnessChanged });
		$('#stroke-brightness .ui-slider-handle').text('0');
		
		coll = localStorage.getItem('editor-stroke-collapsed'); if(coll == 'true') $('#editor-stroke').addClass('collapsed');
		dw = $('#editor-stroke').width(); dh = $('#editor-stroke').height();
		dx = localStorage.getItem('editor-stroke-x'); dy = localStorage.getItem('editor-stroke-y');
		dx = Math.min((dx === null) ? (20) : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (window.innerHeight - dh - 20) : dy, window.innerHeight - dh);
		$('#editor-stroke')
			.offset({left: dx, top: dy})
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
		
		$('body').append(
		'<div id="editor-mask" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Selection</h1>\
		<hr/>\
		<div id="masking-mode" class="left-align"><ul class="scale75">\
		<li><a href="#masking-mode-free" alt="xyz">Box</a></li>\
		<li><a href="#masking-mode-x" alt="x">X Plane</a></li>\
		<li><a href="#masking-mode-y" alt="y">Y Plane</a></li>\
		<li><a href="#masking-mode-z" alt="z">Z Plane</a></li>\
		</ul>\
		<div id="masking-mode-free">\
		<div id="mask-sizing-mode" class="scale75">\
			<label for="mask-sizing-mode-minmax">ext</label><input name="mask-sizing-mode" id="mask-sizing-mode-minmax" type="radio" value="minmax" checked="checked"/>\
			<label for="mask-sizing-mode-size">size</label><input name="mask-sizing-mode" id="mask-sizing-mode-size" type="radio" value="size"/>\
		</div>\
		<hr class="clear"/>\
		<label for="mask-x" class="w3">X&nbsp;<em>min&nbsp;</em></label><input id="mask-x" size="3" class="center" value="0"/>\
		<label for="mask-x2"><em>&nbsp;max&nbsp;</em></label><input id="mask-x2" size="3" class="center"/><br\>\
		<label for="mask-y" class="w3">Y&nbsp;<em>min&nbsp;</em></label><input id="mask-y" size="3" class="center" value="0"/>\
		<label for="mask-y2"><em>&nbsp;max&nbsp;</em></label><input id="mask-y2" size="3" class="center"/><br\>\
		<label for="mask-z" class="w3">Z&nbsp;<em>min&nbsp;</em></label><input id="mask-z" size="3" class="center" value="0"/>\
		<label for="mask-z2"><em>&nbsp;max&nbsp;</em></label><input id="mask-z2" size="3" class="center"/>\
		<div class="subpalette"><a id="mask-wrap">hug</a><a id="mask-grow">grow</a><a id="mask-shrink">shrink</a><a id="mask-reset">reset</a></div>\
		</div>\
		<div id="masking-mode-x"><label>X&nbsp;</label><div id="mask-plane-x" class="mask-plane-slider"/></div>\
		<div id="masking-mode-y"><label>Y&nbsp;</label><div id="mask-plane-y" class="mask-plane-slider"/></div>\
		<div id="masking-mode-z"><label>Z&nbsp;</label><div id="mask-plane-z" class="mask-plane-slider"/></div>\
		</div>\
		</div>');
		
	// masking
	    $("#masking-mode").tabs({activate:editScene.maskingModeChange});
   		$('#mask-sizing-mode').buttonset();
   		$('#mask-sizing-mode input').click(editScene.maskSizingModeChanged);
   		$('#mask-plane-x').slider({min: 0, max: editScene.doc.width - 1, step: 1, slide: editScene.maskPlaneSliderChanged });
   		$('#mask-plane-y').slider({min: 0, max: editScene.doc.height - 1, step: 1, slide: editScene.maskPlaneSliderChanged });
   		$('#mask-plane-z').slider({min: 0, max: editScene.doc.depth - 1, step: 1, slide: editScene.maskPlaneSliderChanged });
   		
	    $( "#mask-x").spinner({min:0, max:editScene.doc.width - 1, step:1, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange });
	    $( "#mask-x2").spinner({min:1, max:editScene.doc.width, value:editScene.doc.width, step:1, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange })
	    $( "#mask-y").spinner({min:0, max:editScene.doc.height - 1, step:1, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange });
	    $( "#mask-y2").spinner({min:1, max:editScene.doc.height, step:1, value:editScene.doc.height, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange })
	    $( "#mask-z").spinner({min:0, max:editScene.doc.depth - 1, step:1, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange });
	    $( "#mask-z2").spinner({min:1, max:editScene.doc.depth, step:1, value: editScene.doc.depth, change: editScene.maskSpinnerChange, stop: editScene.maskSpinnerChange })
		$('#mask-reset').click(editScene.maskReset);
		$('#mask-grow').click(editScene.maskInflate);
		$('#mask-shrink').click(editScene.maskInflate);
		$('#mask-wrap').click(editScene.maskWrap.bind(editScene));
		$('#tab-mask').hide();
		
		coll = localStorage.getItem('editor-mask-collapsed'); if(coll == 'true') $('#editor-mask').addClass('collapsed');
		dw = $('#editor-mask').width(); dh = $('#editor-mask').height();
		dx = localStorage.getItem('editor-mask-x'); dy = localStorage.getItem('editor-mask-y');
		dx = Math.min((dx === null) ? (20) : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (60) : dy, window.innerHeight - dh);
		$('#editor-mask')
			.offset({left: dx, top: dy})
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget', start: bringToFront, stop: savePosOnDrop });
		
	// paste 
		$('body').append(editScene.pasteUI = 
		$('<div id="editor-paste" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Paste</h1>\
		<hr/>\
		<label for="paste-x" class="w0 pad5 right-align">X</label><input id="paste-x" size="3" class="center" value="0"/>\
		<label for="paste-rx" class="w1 pad5 right-align">Rot X</label><input id="paste-rx" size="3" class="center" value="0"/>\
		<label for="paste-sx" class="w2 pad5 right-align">Scale X</label><input id="paste-sx" size="3" class="center" value="0"/><br/>\
		<label for="paste-y" class="w0 pad5 right-align">Y</label><input id="paste-y" size="3" class="center" value="0"/>\
		<label for="paste-ry" class="w1 pad5 right-align">Rot Y</label><input id="paste-ry" size="3" class="center" value="0"/>\
		<label for="paste-sy" class="w2 pad5 right-align">Scale Y</label><input id="paste-sy" size="3" class="center" value="0"/><br/>\
		<label for="paste-z" class="w0 pad5 right-align">Z</label><input id="paste-z" size="3" class="center" value="0"/>\
		<label for="paste-rz" class="w1 pad5 right-align">Rot Z</label><input id="paste-rz" size="3" class="center" value="0"/>\
		<label for="paste-sz" class="w2 pad5 right-align">Scale Z</label><input id="paste-sz" size="3" class="center" value="0"/><br/>\
		<hr/>\
		<div class="scale75 center"><button id="paste-flip-x">Flip X</button>&nbsp;&nbsp;<button id="paste-flip-y">Flip Y</button>&nbsp;&nbsp;<button id="paste-flip-z">Flip Z</button>\
		<span class="separator-right"/><input type="checkbox" title="Auto-store on accept" id="paste-autostore" '+(editScene.autoStorePastePos ? 'checked="true"' : '')+'/>&nbsp;&nbsp;\
		<a id="paste-store">store</a>&nbsp;&nbsp;&nbsp;&nbsp;<a id="paste-restore" disabled="disabled">recall</a>&nbsp;&nbsp;&nbsp;&nbsp;<a id="paste-reset">reset</a></div>\
		<hr/>\
		<div class="center"><button id="paste-accept">Accept</button>&nbsp;<button id="paste-cancel">Cancel</button></div>\
		</div>'));
		
		coll = localStorage.getItem('editor-paste-collapsed'); if(coll == 'true') $('#editor-paste').addClass('collapsed');
		dw = $('#editor-paste').width(); dh = $('#editor-paste').height();
		dx = localStorage.getItem('editor-paste-x'); dy = localStorage.getItem('editor-paste-y');
		dx = Math.min((dx === null) ? (window.innerWidth - dw)*0.5 : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (window.innerHeight - dh - 20) : dy, window.innerHeight - dh);
		editScene.pasteUI
			.offset({left:dx, top: dy })
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
	    $("#paste-x").spinner({min:-256, max:256, step:1, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-rx").spinner({min:-180, max:180, step:15, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-sx").spinner({min:-4.0, max:4.0, step:0.25, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-y").spinner({min:-256, max:256, step:1, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-ry").spinner({min:-180, max:180, step:15, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-sy").spinner({min:-4.0, max:4.0, step:0.25, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-z").spinner({min:-256, max:256, step:1, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-rz").spinner({min:-180, max:180, step:15, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });
	    $("#paste-sz").spinner({min:-4.0, max:4.0, step:0.25, change: editScene.pasteSpinnerChange, stop: editScene.pasteSpinnerChange });

	    $('#paste-flip-x,#paste-flip-y,#paste-flip-z').button().click(editScene.pasteFlip.bind(editScene));
	    $('#paste-store').click(editScene.storePasteValues);
	    $('#paste-restore').click(editScene.restorePasteValues);
	    $('#paste-reset').click(editScene.resetPasteValues);
	    $('#paste-accept').button().click(editScene.completePaste.bind(editScene));
	    $('#paste-cancel').button().click(editScene.cancelPaste.bind(editScene));
	    $('#paste-autostore').change(editScene.autoStorePastePosChanged.bind(editScene));
	    
	// preview
		$('body').append(
		'<div id="editor-preview" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Preview</h1>\
		<hr/>\
		<label for="preview-smooth-normals" class="w4 right-align">Smooth normals&nbsp;&nbsp;</label>\
		<input id="preview-smooth-normals" size="3" class="center" value="'+Math.floor(editScene.doc.smoothNormals*100)+'"/><br/>\
		<label for="preview-occlusion" class="w4 right-align">Occlusion&nbsp;&nbsp;</label>\
		<input id="preview-occlusion" size="3" class="center" value="'+Math.floor(editScene.doc.occlusion*100)+'"/><br/>\
		<label for="preview-point-size" class="w4 right-align">Point Size&nbsp;&nbsp;</label>\
		<input id="preview-point-size" size="3" class="center" value="'+Math.floor(editScene.doc.pointSize)+'"/><br/>\
		<label for="preview-optimize" class="w4 right-align">Optimize&nbsp;&nbsp;</label><input type="checkbox" id="preview-optimize" '
		+(editScene.doc.optimize ? 'checked="checked"' : '')+'/><br/>\
		<label for="preview-floor" class="w4 right-align">Floor&nbsp;&nbsp;</label><input type="checkbox" id="preview-floor" '
		+(editScene.doc.floor ? 'checked="checked"' : '')+'/>\
		</div>');
		
		$( "#preview-smooth-normals").spinner({min:0, max:100, step:10, change: editScene.smoothNormalsChanged, stop: editScene.smoothNormalsChanged });
		$( "#preview-occlusion").spinner({min:0, max:100, step:10, change: editScene.occlusionChanged, stop: editScene.occlusionChanged });
		$( "#preview-point-size").spinner({min:0, max:10, step:0.25, change: editScene.pointSizeChanged, stop: editScene.pointSizeChanged });
		$( "#preview-optimize").change(editScene.optimizeChanged);
		$( "#preview-floor").change(editScene.floorChanged);
		coll = localStorage.getItem('editor-preview-collapsed'); if(coll == 'true') $('#editor-preview').addClass('collapsed');
		dw = $('#editor-preview').width(); dh = $('#editor-preview').height();
		dx = localStorage.getItem('editor-preview-x'); dy = localStorage.getItem('editor-preview-y');
		dx = Math.min((dx === null) ? (window.innerWidth - dw - 20) : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (60) : dy, window.innerHeight - dh);
		$('#editor-preview')
			.offset({left:dx, top: dy })
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
		
	// light control
		$('body').append(
		'<div id="editor-lights" class="ui-widget-header ui-corner-all center editor collapsed floating-panel">\
		<h1>Lights</h1>\
		<hr/>\
		<div id="light-type" class="left-align"><ul class="scale75">\
		<li><a href="#tab-ambient">Ambient</a></li>\
		<li><a href="#tab-hemi">Hemisphere</a></li>\
		<li><a href="#tab-point">Point</a></li>\
		<li><a href="#tab-spot">Spot</a></li>\
		<li><a href="#tab-direct">Direct</a></li>\
		</ul>\
		<div id="tab-ambient">\
		<label for="ambient-color">Color</label><div id="ambient-color" class="color-swatch" style="background-color:#'+editScene.ambient.color.getHexString()+'"/>\
		</div>\
		<div id="tab-hemi">\
		<label for="hemi-color">Sky Color</label><div id="hemi-color" class="color-swatch" style="background-color:#'+editScene.hemi.color.getHexString()+'"/><br/>\
		<label for="hemi-ground-color">Ground</label><div id="hemi-ground-color" class="color-swatch" style="background-color:#'+editScene.hemi.groundColor.getHexString()+'"/><br/>\
		<Label for="hemi-intensity">Intensity</label><div id="hemi-intensity" class="intensity-slider"/>\
		</div>\
		<div id="tab-point">\
		<label for="point-color">Color</label><div id="point-color" class="color-swatch" style="background-color:#'+editScene.point.color.getHexString()+'"/><br/>\
		<Label for="point-intensity">Intensity</label><div id="point-intensity" class="intensity-slider"/><br/>\
		<Label for="point-falloff">Falloff</label><div id="point-falloff" class="falloff-slider"/><br/>\
		<Label for="point-distance">Distance</label><div id="point-distance" class="distance-slider"/><br/>\
		<Label for="point-direction">Direction</label><div id="point-direction" class="direction-slider"/><br/>\
		<Label for="point-elevation">Elevation</label><div id="point-elevation" class="elevation-slider"/>\
		</div>\
		<div id="tab-spot">\
		<label for="spot-color">Color</label><div id="spot-color" class="color-swatch" style="background-color:#'+editScene.spot.color.getHexString()+'"/>\
		<label class="w3 right-align" for="spot-shadow">Shadow</label>&nbsp;<input type="checkbox" id="spot-shadow" '+((localStorage.getItem('spot-shadow') !== 'false') ? 'checked="checked"':'')+'/><br/>\
		<Label for="spot-intensity">Intensity</label><div id="spot-intensity" class="intensity-slider"/><br/>\
		<Label for="spot-falloff">Falloff</label><div id="spot-falloff" class="falloff-slider"/><br/>\
		<Label for="spot-exp">Exponent</label><div id="spot-exp" class="exp-slider"/><br/>\
		<Label for="spot-angle">Angle</label><div id="spot-angle" class="angle-slider"/><br/>\
		<Label for="spot-distance">Distance</label><div id="spot-distance" class="distance-slider"/><br/>\
		<Label for="spot-direction">Direction</label><div id="spot-direction" class="direction-slider"/><br/>\
		<Label for="spot-elevation">Elevation</label><div id="spot-elevation" class="elevation-slider"/>\
		</div>\
		<div id="tab-direct">\
		<label for="direct-color">Color</label><div id="direct-color" class="color-swatch" style="background-color:#'+editScene.sun.color.getHexString()+'"/>\
		<label class="w3 right-align" for="direct-shadow">Shadow</label>&nbsp;<input type="checkbox" id="direct-shadow" '+((localStorage.getItem('direct-shadow') !== 'false') ? 'checked="checked"':'')+'/><br/>\
		<Label for="direct-intensity">Intensity</label><div id="direct-intensity" class="intensity-slider"/><br/>\
		<Label for="direct-direction">Direction</label><div id="direct-direction" class="direction-slider"/><br/>\
		<Label for="direct-elevation">Elevation</label><div id="direct-elevation" class="elevation-slider"/>\
		</div>\
		</div>\
		</div>');
		
		$('#light-type').tabs({activate:editScene.lightTabChanged});
		$('#editor-lights .color-swatch').colpick({
			colorScheme:'dark',
			submit:0,
			onShow: function(dom){ 
				$(dom).css({zIndex: 1000})
				var src = $(this);
				var clr = new THREE.Color(src.css('background-color'));
				src.colpickSetColor(clr.getHexString(), true); 				
			},
			onChange:this.lightColorChanged
		});
		$('#editor-lights .intensity-slider').slider({min: 0, max: 500, step: 1, slide: editScene.lightIntensityChanged });
		$('#editor-lights .falloff-slider').slider({min: 0, max: 500, step: 1, slide: editScene.lightFalloffChanged });
		$('#editor-lights .distance-slider').slider({min: 0, max: 500, step: 1, slide: editScene.lightDistanceChanged });
		$('#editor-lights .direction-slider').slider({min: 0, max: 360, step: 1, slide: editScene.lightDirectionChanged });
		$('#editor-lights .angle-slider').slider({min: 0, max: 80, step: 1, slide: editScene.lightAngleChanged });
		$('#editor-lights .exp-slider').slider({min: 0, max: 5000, step: 100, slide: editScene.lightExpChanged });
		$('#editor-lights .elevation-slider').slider({min: -90, max: 90, step: 1, slide: editScene.lightElevationChanged });
		
		$('#spot-shadow').change(editScene.lightShadowChanged);
		$('#direct-shadow').change(editScene.lightShadowChanged);
		
		$('#hemi-intensity').slider('value',Math.floor(editScene.hemi.intensity * 100));
		$('#hemi-intensity .ui-slider-handle').text($('#hemi-intensity').slider('value'));
		$('#point-intensity').slider('value',Math.floor(editScene.point.intensity * 100));
		$('#point-intensity .ui-slider-handle').text($('#point-intensity').slider('value'));
		$('#point-falloff').slider('value',Math.floor(editScene.point.distance));
		$('#point-falloff .ui-slider-handle').text($('#point-falloff').slider('value'));
		$('#point-distance').slider('value',Math.floor(editScene.point.dist));
		$('#point-distance .ui-slider-handle').text($('#point-distance').slider('value'));
		$('#point-direction').slider('value',Math.floor(180 * editScene.point.direction / Math.PI));
		$('#point-direction .ui-slider-handle').text($('#point-direction').slider('value'));
		$('#point-elevation').slider('value',Math.floor(180 * -editScene.point.elev / Math.PI));
		$('#point-elevation .ui-slider-handle').text($('#point-elevation').slider('value'));		
		$('#spot-intensity').slider('value',Math.floor(editScene.spot.intensity * 100));
		$('#spot-intensity .ui-slider-handle').text($('#spot-intensity').slider('value'));
		$('#spot-falloff').slider('value',Math.floor(editScene.spot.distance));
		$('#spot-falloff .ui-slider-handle').text($('#spot-falloff').slider('value'));
		$('#spot-exp').slider('value',Math.floor(editScene.spot.exponent));
		$('#spot-exp .ui-slider-handle').text($('#spot-falloff').slider('value'));
		$('#spot-distance').slider('value',Math.floor(editScene.spot.dist));
		$('#spot-distance .ui-slider-handle').text($('#spot-distance').slider('value'));
		$('#spot-angle').slider('value',Math.floor(180 * editScene.spot.angle / Math.PI));
		$('#spot-angle .ui-slider-handle').text($('#spot-angle').slider('value'));
		$('#spot-direction').slider('value',Math.floor(180 * editScene.spot.direction / Math.PI));
		$('#spot-direction .ui-slider-handle').text($('#spot-direction').slider('value'));
		$('#spot-elevation').slider('value',Math.floor(180 * -editScene.spot.elev / Math.PI));
		$('#spot-elevation .ui-slider-handle').text($('#spot-elevation').slider('value'));	
		$('#direct-intensity').slider('value',Math.floor(editScene.sun.intensity * 100));
		$('#direct-intensity .ui-slider-handle').text($('#direct-intensity').slider('value'));
		$('#direct-direction').slider('value',Math.floor(180 * editScene.sun.direction / Math.PI));
		$('#direct-direction .ui-slider-handle').text($('#direct-direction').slider('value'));
		$('#direct-elevation').slider('value',Math.floor(180 * -editScene.sun.elev / Math.PI));
		$('#direct-elevation .ui-slider-handle').text($('#direct-elevation').slider('value'));
		
		coll = localStorage.getItem('editor-lights-collapsed'); if(coll == 'true') $('#editor-lights').addClass('collapsed'); else if(coll == 'false') $('#editor-lights').removeClass('collapsed');
		dw = $('#editor-lights').width(); dh = $('#editor-lights').height();
		dx = localStorage.getItem('editor-lights-x'); dy = localStorage.getItem('editor-lights-y');
		dx = Math.min((dx === null) ? $('#menu-bar').width() : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (10) : dy, window.innerHeight - dh);
		$('#editor-lights')
			.offset({left: dx, top: dy})
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });		

	// animations
		$('body').append(
		'<div id="editor-anims" class="ui-widget-header ui-corner-all editor floating-panel collapsed">\
		<h1>Animations</h1>\
		<hr/>\
		<button id="anim-add">Add</button><button id="anim-dupe">Dupe</button><span class="separator-left"/><button id="anim-delete">Delete</button>\
		<hr/>\
		<div id="anim-list"></div>\
		<div id="anim-details">\
		<hr/>\
		<label for="anim-name" class="w2 right-align">Name&nbsp;</label><input type="text" id="anim-name" size="10"/>\
		<label for="anim-fps" class="w1 right-align">FPS&nbsp;</label><input id="anim-fps" size="3" class="center" value=""/><br/>\
		<hr/>\
		<label for="anim-start" class="w2 right-align">Start&nbsp;</label><input id="anim-start" size="3" class="center" value=""/>\
		<label for="anim-len" class="w2 right-align">Length&nbsp;</label><input id="anim-len" size="3" class="center" value=""/><br/>\
		<div class="center scale75"><a id="anim-set">&uArr; assign from range</a>&nbsp;<span class="separator-left"/>&nbsp;<a id="anim-get">&dArr; copy to range</a></div>\
		<hr/>\
		<label for="anim-meta" class="w2 right-align">Meta&nbsp;</label><input type="text" id="anim-meta" size="25"/>\
		</div>\
		</div>');
		
		$("#anim-add").button().click(editScene.animAdd.bind(editScene));
		$("#anim-dupe").button().click(editScene.animDupe.bind(editScene));
		$("#anim-list").click(editScene.animSelect.bind(editScene));
		$("#anim-delete").button().click(editScene.animDelete.bind(editScene));
		$("#anim-fps").spinner({min:1, max:30, step:1, change: editScene.animFPSChanged.bind(editScene), stop: editScene.animFPSChanged.bind(editScene) });
		$("#anim-start").spinner({min:1, max:1, step:1, change: editScene.animStartChanged.bind(editScene), stop: editScene.animStartChanged.bind(editScene) });
		$("#anim-len").spinner({min:1, max:1, step:1, change: editScene.animLengthChanged.bind(editScene), stop: editScene.animLengthChanged.bind(editScene) });
		$("#anim-name").click(function(e){ if(editScene.focusedTextField!=e.target)e.target.focus(); }).change(editScene.animNameChanged.bind(editScene));
		$("#anim-meta").click(function(e){ if(editScene.focusedTextField!=e.target)e.target.focus(); }).change(editScene.animMetaChanged.bind(editScene));
		
		$('#anim-get').click(editScene.animSetRange.bind(editScene));
		$('#anim-set').click(editScene.animSetFromRange.bind(editScene));
		
		coll = localStorage.getItem('editor-anims-collapsed'); if(coll == 'true') $('#editor-anims').addClass('collapsed'); else if(coll == 'false') $('#editor-anims').removeClass('collapsed');
		dw = $('#editor-anims').width(); dh = $('#editor-anims').height();
		dx = localStorage.getItem('editor-anims-x'); dy = localStorage.getItem('editor-anims-y');
		dx = Math.min((dx === null) ? (window.innerWidth - dw - 20) : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (200) : dy, window.innerHeight - dh);
		$('#editor-anims')
			.offset({left:dx, top: dy })
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
	
	// anchors
		$('body').append(
		'<div id="editor-anchors" class="ui-widget-header ui-corner-all editor floating-panel collapsed">\
		<h1>Anchors</h1>\
		<hr/>\
		<button id="anchor-add">Add</button><button id="anchor-dupe">Dupe</button><span class="separator-left"/><button id="anchor-delete">Delete</button>\
		<span class="separator-left"/><label for="anchors-show">Show</label><input type="checkbox" id="anchors-show" '+(editScene.anchors.visible ? 'checked="checked"' : '')+'/>\
		<hr/>\
		<div id="anchor-list"></div>\
		<div id="anchor-details">\
		<hr/>\
		<label for="anchor-name" class="w2 right-align">Name&nbsp;</label><input type="text" id="anchor-name" size="40"/>\
		<hr/>\
		<div class="column">\
		<label for="anchor-x" class="w1 right-align">X&nbsp;</label><input id="anchor-x" size="3" class="center" value=""/><br/>\
		<label for="anchor-y" class="w1 right-align">Y&nbsp;</label><input id="anchor-y" size="3" class="center" value=""/><br/>\
		<label for="anchor-z" class="w1 right-align">Z&nbsp;</label><input id="anchor-z" size="3" class="center" value=""/></div>\
		<div class="column">\
		<label for="anchor-rx" class="w2 right-align">Rot X&nbsp;</label><input id="anchor-rx" size="3" class="center" value=""/><br/>\
		<label for="anchor-ry" class="w2 right-align">Rot Y&nbsp;</label><input id="anchor-ry" size="3" class="center" value=""/><br/>\
		<label for="anchor-rz" class="w2 right-align">Rot Z&nbsp;</label><input id="anchor-rz" size="3" class="center" value=""/></div>\
		<div class="column">\
		<label for="anchor-sx" class="w2 right-align">Scale X&nbsp;</label><input id="anchor-sx" size="3" class="center" value=""/><br/>\
		<label for="anchor-sy" class="w2 right-align">Scale Y&nbsp;</label><input id="anchor-sy" size="3" class="center" value=""/><br/>\
		<label for="anchor-sz" class="w2 right-align">Scale Z&nbsp;</label><input id="anchor-sz" size="3" class="center" value=""/></div>\
		<div class="center scale75 clear"><a id="anchor-toall">&larr; copy anchor values to all frames &rarr;</a><span class="separator-left"/>\
		<a id="anchor-copy">copy</a>&nbsp;&nbsp;&nbsp;&nbsp;<a id="anchor-paste" '+(localStorage.getItem('anchor-paste') ? '' : 'disabled="disabled"')+'>paste</a></div>\
		<hr/>\
		<label for="anchor-meta" class="w2 right-align">Meta&nbsp;</label><input type="text" id="anchor-meta" size="40"/>\
		</div>\
		</div>');
		
		$("#anchor-add").button().click(editScene.anchorAdd.bind(editScene));
		$("#anchor-dupe").button().click(editScene.anchorDupe.bind(editScene));
		$("#anchor-list").click(editScene.anchorSelect.bind(editScene));
		var ap = editScene.anchorParamChanged.bind(editScene);
		$("#anchor-x").spinner({min:-10, max:100, step:1, change: ap, stop: ap });
		$("#anchor-rx").spinner({min:-180, max:180, step:15, change: ap, stop: ap });
		$("#anchor-sx").spinner({min:-5, max:5, step:0.1, change: ap, stop: ap });
		$("#anchor-y").spinner({min:-10, max:100, step:1, change: ap, stop: ap });
		$("#anchor-ry").spinner({min:-180, max:180, step:15, change: ap, stop: ap });
		$("#anchor-sy").spinner({min:-5, max:5, step:0.1, change: ap, stop: ap });
		$("#anchor-z").spinner({min:-10, max:100, step:1, change: ap, stop: ap });
		$("#anchor-rz").spinner({min:-180, max:180, step:15, change: ap, stop: ap });
		$("#anchor-sz").spinner({min:-5, max:5, step:0.1, change: ap, stop: ap });
		$("#anchor-delete").button().click(editScene.anchorDelete.bind(editScene));
		$("#anchor-name").click(function(e){ if(editScene.focusedTextField!=e.target)e.target.focus(); }).change(editScene.anchorNameChanged.bind(editScene));
		$("#anchor-meta").click(function(e){ if(editScene.focusedTextField!=e.target)e.target.focus(); }).change(ap);
		$('#anchors-show').change(editScene.anchorsVisibleChanged.bind(editScene));
		$('#anchor-toall').click(editScene.anchorCopyValuesToAllFrames.bind(editScene));
		$('#anchor-copy').click(editScene.anchorCopyValues.bind(editScene));
		$('#anchor-paste').click(editScene.anchorPasteValues.bind(editScene));
		
		coll = localStorage.getItem('editor-anchors-collapsed'); if(coll == 'true') $('#editor-anchors').addClass('collapsed'); else if(coll == 'false') $('#editor-anchors').removeClass('collapsed');
		dw = $('#editor-anchors').width(); dh = $('#editor-anchors').height();
		dx = localStorage.getItem('editor-anchors-x'); dy = localStorage.getItem('editor-anchors-y');
		dx = Math.min((dx === null) ? (window.innerWidth - dw - 20) : dx, window.innerWidth - dw);
		dy = Math.min((dy === null) ? (300) : dy, window.innerHeight - dh);
		$('#editor-anchors')
			.offset({left:dx, top: dy })
			.draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button', start: bringToFront, stop: savePosOnDrop });
	
	// replace shortcut text
		$('.editor .ctrl').append(navigator.appVersion.indexOf("Mac")!=-1 ? '⌘ ':'Ctrl + ');
	
	// undo/redo
		$('#undo').button().click(this.performUndo.bind(this));
		$('#redo').button().click(this.performRedo.bind(this));
		
	// protect canvas when over UI
		$('.editor').hover(editScene.disableCanvasInteractions.bind(editScene),
							editScene.enableCanvasInteractions.bind(editScene));
		$("div").disableSelection();
		
	// add collapse buttons
		$('#editor-preview,#editor-masking,#editor-stroke,#editor-lights,#editor-mask,#editor-paste,#editor-toolbar,#editor-anims,#editor-anchors').prepend('<a class="toggleCollapse">[-]</a>');
		$('.toggleCollapse').click(function(){
			var parent = $(this).parent();
			parent.toggleClass('collapsed');
			var collapsed = parent.hasClass('collapsed');
			$(this).text(collapsed ? '[+]' : '[-]');
			var dw = parent.width(), dh = parent.height();
			var pos = parent.offset();
			parent.offset({left:Math.min(pos.left, window.innerWidth - dw - 20),
							top: Math.min(pos.top, window.innerHeight - dh - 20)});
			localStorage.setItem(parent.get(0).id+'-collapsed', collapsed);
		});
		
	// focus/blur
		$('input').on('focus',function(e){editScene.focusedTextField = e.target; editScene.disableKeyboardShortcuts();})
				  .on('blur',function(e){editScene.focusedTextField = null; editScene.enableKeyboardShortcuts();})
				  .on('keyup',function(e){ if(e.which == 13) e.target.blur(); });
		
	// hide paste
	    editScene.pasteUI.detach();
	    
		editScene.refreshAnchors();	    
	},
	
	/* dispose of main UI */
	removeUI:function(){
		$('.editor').remove();
		$('body').off('mouseup.editor');
	},
	
	showHelp:function(){
		$('.submenu').hide();
		if(!$('#help-view').length){
			$('body').append('<div id="help-view" class="no-close">\
			<h2>Shortcuts</h2>\
			<em>Ctrl + N</em> new document<br/>\
			<br/>\
			<em><span class="ctrl"/>C</em> copy selection<br/>\
			<em><span class="ctrl"/>X</em> cut selection<br/>\
			<em><span class="ctrl"/>V</em> paste selection<br/>\
			<em>Enter</em> accept paste placement<br/>\
			<em>Escape</em> cancel paste<br/>\
			<br/>\
			<em>F</em> fill selection<br/>\
			<em>Delete</em> clear selection<br/>\
			<em>+ -</em> inflate, deflate selection<br/>\
			<em>[ ]</em> move selection plane ±1 (Selection X,Y,Z mode)<br/>\
			<em>Shift + Ctrl</em> selection manipulation mode<br/>\
			<br/>\
			<em>&lt; &gt;</em> step frame ±1<br/>\
			<em>Space</em> play/stop<br/>\
			<br/>\
			<em><span class="ctrl"/>Z</em> undo<br/>\
			<em>Shift + <span class="ctrl"/>Z</em> redo<br/>\
			<br/>\
			<h2>Timeline</h2>\
			<em>LMB</em> drag frames to reorder<br/>\
			<em>Shift + LMB</em> select frame range<br/>\
			<em>Shift + <span class="ctrl"/>C</em> copy frame range<br/>\
			<em>Shift + <span class="ctrl"/>X</em> cut frame range<br/>\
			<em>Shift + <span class="ctrl"/>V</em> paste frame range<br/>\
			<h2>Painting Modifiers</h2>\
			<em>Shift</em> replace existing pixels only<br/>\
			<em>Alt</em> subtract pixels<br/>\
			<em>Shift + Alt</em> eyedropper mode<br/>\
			<em>Ctrl</em> rotate model, don\'t paint<br/><br/>\
			</div>');
		}
		
		$('#help-view .ctrl').append(navigator.appVersion.indexOf("Mac")!=-1 ? '⌘ ':'Ctrl + ');
		
		editScene.disableCanvasInteractions(true);
		$('#help-view').dialog({
	      resizable: false, width: 500, height:500, modal: true, dialogClass:'no-close', title:"Help",
	      buttons: { OK: function() { $(this).dialog("close"); } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
	      });
	},
	
	// unfocus from text field or 
	blur:function(){
		if(editScene.focusedTextField) editScene.focusedTextField.blur();
		$('div,span').blur();
	},
	
	disableCanvasInteractions:function(all){
		if(this.stroking || this.controls.busy()) { 
			this.disableCanvasInteractionsOnRelease = true;
		} else {
			this.canvasInteractionsEnabled = false;
		}
		
		if(all === true){
			$(window).off('.editor');
			this.disableKeyboardShortcuts();
		}
	},
	
	enableCanvasInteractions:function(all){
		this.disableCanvasInteractionsOnRelease = false;
		this.canvasInteractionsEnabled = true;
		if(all === true){
			this.enableKeyboardShortcuts();
			$(window).on('keydown.editor', this.keyDown.bind(this));
			$(window).on('keyup.editor', this.keyUp.bind(this));
			$(window).on('mouseup.editor', this.mouseUp.bind(this));
			$(window).on('mousemove.editor', this.mouseMove.bind(this));
			$(window).on('mousedown.editor', this.mouseDown.bind(this));
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Keyboard functions */

	enableKeyboardShortcuts:function(){
		key('ctrl+n,⌘+n', function(){ editScene.newDoc(); return false; });
		key('ctrl+z,⌘+z', function(){ editScene.performUndo(); return false; });
		key('ctrl+shift+z,⌘+shift+z', function(){ editScene.performRedo(); return false; });
		key('ctrl+shift+c,⌘+shift+c', function(){ editScene.frameRangeCopy({}); return false; });
		key('ctrl+shift+v,⌘+shift+v', function(){ editScene.frameRangePaste({}); return false; });
		key('ctrl+shift+x,⌘+shift+x', function(){ editScene.frameRangeCut({}); return false; });
		key('ctrl+c,⌘+c', function(){ editScene.copySelection(); return false; });
		key('ctrl+v,⌘+v', function(){ editScene.pasteSelection(); return false; });
		key('ctrl+x,⌘+x', function(){ editScene.cutSelection(); return false; });
		key('escape', function(){ editScene.cancelPaste(); return false; });
	},

	disableKeyboardShortcuts:function(){
		key.unbind('ctrl+n,⌘+n');
		key.unbind('ctrl+z,⌘+z');
		key.unbind('ctrl+c,⌘+c');
		key.unbind('ctrl+x,⌘+x');
		key.unbind('ctrl+v,⌘+v');
		key.unbind('ctrl+shift+c,⌘+shift+c');
		key.unbind('ctrl+shift+x,⌘+shift+x');
		key.unbind('ctrl+shift+v,⌘+shift+v');
		key.unbind('escape');
		key.unbind('ctrl+shift+z,⌘+shift+z');
	},

	/* shortcuts */
	keyUp:function(e){
		if(editScene.focusedTextField || editScene.stroking || editScene.movingMask || editScene.movingPaste) return;
	
		e.preventDefault();
		if($('.ui-dialog').length) return;

		switch(e.which){
		case 90: // Z
			if(e.shiftKey) editScene.performRedo();
			else editScene.performUndo();
			break;
		case 16:
			editScene.shift = false;
			break;
		case 17:
			editScene.ctrl = false;
			break;
		case 18:
			editScene.alt = false;
			break;
		}
		if(!this.stroking && !this._pasteMode) editScene.enableMaskControls(editScene.shift && editScene.ctrl);
	},
	
	keyDown:function(e){
		if(editScene.focusedTextField || editScene.stroking || editScene.movingMask || editScene.movingPaste) return;
		
		e.preventDefault();
		
		if($('.ui-dialog').length) return;
		
		switch(e.which){
		case 16:
			editScene.shift = true;
			break;
		case 17:
			editScene.ctrl = true;
			editScene.controls.rotateEnabled = !editScene.shift;
			break;
		case 18:
			editScene.alt = true;
			break;
		case 219:// [
			editScene.maskPlaneStep(-1);
			break;
		case 221:// ]
			editScene.maskPlaneStep(1);
			break;
		case 188:// 
			editScene.currentFrame--;
			break;
		case 190:// >
			editScene.currentFrame++;
			break;
		case 8: // del
		case 46: // back
			editScene.fillBox(null, true);
			break;
		case 70: // f
			editScene.fillBox(null, false);
			break;
		case 187: // +
			editScene.maskInflate(null, 1);
			break;
		case 189:// -
			editScene.maskInflate(null, -1);
			break;
		case 13: // enter
			editScene.completePaste();
			break;
		case 37: // left
			editScene.moveTool(-(e.shiftKey ? 5 : 1),0);
			break;
		case 39: // right
			editScene.moveTool((e.shiftKey ? 5 : 1),0);
			break;
		case 38: // up
			editScene.moveTool(0,(e.shiftKey ? 5 : 1));
			break;
		case 40: // down
			editScene.moveTool(0,-(e.shiftKey ? 5 : 1));
			break;
		case 32: // space
			if(editScene.playing) editScene.stop();
			else editScene.play();
			break;
			
		default:
			console.log(e);
			break;
		}
		if(!this.stroking && !this._pasteMode) editScene.enableMaskControls(editScene.shift && editScene.ctrl);
		
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Framework */

	/* initialize */
	init:function(){
		// defaults
		var bgc = localStorage.getItem('editor-bg-color');
		this.clearColor = (bgc !== null ? parseInt(bgc,16) : 0x333333);	
		
		// setup scene
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(0x00FFFF, 10000, 100000);
		
		// ambient
		var ambColor = localStorage.getItem('ambient-color');
		this.ambient = new THREE.AmbientLight(ambColor !== null ? parseInt(ambColor,16) : 0x202122);
		this.scene.add(this.ambient);

		// hemi
		var skyColor = localStorage.getItem('hemi-color');
		var groundColor = localStorage.getItem('hemi-ground-color');
		var intensity = localStorage.getItem('hemi-intensity');
		this.hemi = new THREE.HemisphereLight(
			skyColor !== null ? parseInt(skyColor, 16) : 0x4f8cb8,
			groundColor !== null ? parseInt(groundColor, 16) : 0x3d2410,
			intensity !== null ? parseFloat(intensity) : 0.1
		);
		this.scene.add(this.hemi);

		// point
		var pointColor = localStorage.getItem('point-color');
		intensity = localStorage.getItem('point-intensity');
		var falloff = localStorage.getItem('point-falloff');
		this.point = new THREE.PointLight(
			pointColor !== null ? parseInt(pointColor, 16) : 0xfff066,
			intensity !== null ? parseFloat(intensity) : 0.1,
			falloff !== null ? parseFloat(falloff) : 250
		);
		this.updatePointLightPos();
		this.scene.add(this.point);
		this.pointHelper = new THREE.PointLightHelper(this.point, 5);
	    this.pointHelper.visible = false;
		this.scene.add(this.pointHelper);

		// camera
		this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000000 );
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.scene.add(this.camera);
		this.controls = new THREE.EditorControls(this.camera, renderer.webgl.domElement);

		this.thumbnailCamera = new THREE.OrthographicCamera( 64 / - 2, 64 / 2, 64 / 2, 64 / - 2, 0.25, 10000);
		this.thumbnailCamera.position.set(512, 512, 512);
		this.thumbnailCamera.lookAt(0,0,0);
		this.scene.add(this.thumbnailCamera);

	    // spot
		pointColor = localStorage.getItem('spot-color');
		intensity = localStorage.getItem('spot-intensity');
		falloff = localStorage.getItem('spot-falloff');
		var angle = localStorage.getItem('spot-angle');
		var exp = localStorage.getItem('spot-exp');
		this.spot = new THREE.SpotLight(pointColor !== null ? parseInt(pointColor, 16) : 0xffffff, 
										intensity !== null ? parseFloat(intensity) : 0.8,
										falloff !== null ? parseFloat(falloff) : 200,
										angle !== null ? parseFloat(angle) : (Math.PI / 4),
										exp !== null ? parseFloat(exp) : (10.0));
		this.spot.castShadow = true;//(localStorage.getItem('spot-shadow') !== 'false');
		this.spot.position.set(100,100,100);
		this.spot.shadowCameraVisible = false;
		this.spot.shadowDarkness = Math.min(1.0, this.spot.intensity * 0.5);
	    this.spot.shadowMapWidth = this.spot.shadowMapHeight = 512;
	    this.spot.shadowCameraNear = 5;
		this.spot.shadowCameraFar = 600;
	    this.spot.shadowCameraLeft = -128;
		this.spot.shadowCameraRight = 128;
		this.spot.shadowCameraTop = 128;
		this.spot.shadowCameraBottom = -128;
		this.spot.shadowBias = 0;
	    this.scene.add(this.spot);
	    
	    this.spotHelper = new THREE.SpotLightHelper(this.spot, 5);
	    this.spotHelper.visible = false;
	    this.scene.add(this.spotHelper);
		this.updateSpotLightPos();
	    
	    // sun
		pointColor = localStorage.getItem('direct-color');
		intensity = localStorage.getItem('direct-intensity');
		this.sun = new THREE.DirectionalLight(pointColor !== null ? parseInt(pointColor, 16) : 0xfff0ee, intensity !== null ? parseFloat(intensity) : 0.8);
		this.sun.shadowCameraVisible = false;
		this.sun.castShadow = true;//(localStorage.getItem('direct-shadow') !== 'false');
		this.sun.shadowDarkness = Math.min(1.0, this.sun.intensity * 0.5);
	    this.sun.shadowMapWidth = this.sun.shadowMapHeight = 2048;
	    this.sun.shadowCameraNear = 0;
		this.sun.shadowCameraFar = 2048;
	    this.sun.shadowCameraLeft = -128;
		this.sun.shadowCameraRight = 128;
		this.sun.shadowCameraTop = 128;
		this.sun.shadowCameraBottom = -128;
		this.sun.shadowBias = -0.0005;
	    this.scene.add(this.sun);
	    this.sunHelper = new THREE.DirectionalLightHelper(this.sun, 0.2);
	    this.sunHelper.frustumCulled = false;
	    this.sunHelper.visible = false;
	    this.scene.add(this.sunHelper);
		this.updateDirectLightPos();
	    
   		// projector & mouse picker
		this.projector = new THREE.Projector();
		this.raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3(), 0.01, this.camera.far ) ;
		this.projectorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

		// create render target
		var renderTargetParameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale,
												window.innerHeight * renderer.scale, renderTargetParameters );
					
		// pixel cube
		this.geomCube = new THREE.BoxGeometry(1,1,1);
		this.geomCube.computeBoundingSphere();
		this.geomCube.computeBoundingBox();
		
		// shadow preview plane
		this.shadowPreviewPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 10, 10), new THREE.MeshPixelBoxMaterial({color: 0x333333}));
		this.shadowPreviewPlane.rotation.x = -Math.PI * 0.5;
		this.shadowPreviewPlane.receiveShadow = true;
		this.shadowPreviewPlane.visible = (localStorage.getItem('floorHidden') !== 'true');
		this.scene.add(this.shadowPreviewPlane);
		
		renderer.webgl.shadowMapEnabled = true;
		renderer.webgl.shadowMapSoft = true;
		renderer.webgl.shadowMapType = THREE.PCFSoftShadowMap;

		this.anchors = new THREE.Object3D();
		this.scene.add(this.anchors);
		this.anchors.visible = (localStorage.getItem('show-anchors') !== 'false');
		
		var data = localStorage.getItem('holdDoc');
      	if(data){ 
      		this.newDocFromData(JSON.parse(data));
      	} else {
			this.newDoc(8,8,8);
		}
		
		setTimeout(this.maskReset.bind(this), 10);
		this.resetZoom();
	},
	
	/* callbacks */
	onWillAdd:function(){
		$(window).on('resize.editScene',this.onResized.bind(this));
	},		
	onAdded:function(){
		this.addUI();
		$(window).on('keydown.editor', this.keyDown.bind(this));
		$(window).on('keyup.editor', this.keyUp.bind(this));
		$(window).on('mouseup.editor', this.mouseUp.bind(this));
		$(window).on('mousemove.editor', this.mouseMove.bind(this));
		$(window).on('mousedown.editor', this.mouseDown.bind(this));
      	
		editScene.enableKeyboardShortcuts();
	},
	onWillRemove:function(){ 
		this.removeUI();
		$(window).off('.editor');
		editScene.disableKeyboardShortcuts();
	},
	onRemoved:function(){
		this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = false;
		$(window).off('.editor');
		if(this.model){
			this.model.dispose();
			this.scene.remove(this.model);
		}		
	},
	
	render:function( delta, rtt ) {
		renderer.webgl.setClearColor( this.clearColor, 1 );
		if (rtt) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
	},
	
	onResized: function(){
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		var renderTargetParameters = { 
			minFilter: THREE.LinearFilter, 
			magFilter: THREE.LinearFilter, 
			format: THREE.RGBFormat, 
			stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale, window.innerHeight * renderer.scale, renderTargetParameters );
		this.refreshThumbnails();
    },
};

var editScene = new EditScene();

/* helper */
function fake0(v){ if(Math.abs(v) < 0.01) return 0; else return v; }
function not0(v){ if(Math.abs(v) < 0.01 || isNaN(v)) return 0.001; else return v; }
function notNaN(v){ if(isNaN(v)) return 0; else return v; }
