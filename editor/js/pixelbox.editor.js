/* 	
	
	Editor support

	The functions below are used by the PixelBox editor
	
*/

THREE.PixelBox.prototype.raycast = ( function () {

	var inverseMatrix = new THREE.Matrix4();
	var ray = new THREE.Ray();
	var temp = new THREE.Vector3(), temp2 = new THREE.Vector3();

	return function ( raycaster, intersects ) {

		var object = this;
		var geometry = object.geometry;
		var threshold = raycaster.params.PointCloud.threshold;

		inverseMatrix.getInverse( this.matrixWorld );
		ray.copy( raycaster.ray ).applyMatrix4( inverseMatrix );
		
		geometry.computeBoundingBox();

		if(ray.isIntersectionBox( geometry.boundingBox ) === false ) {
			return;
		}

		var localThreshold = this.pointSize; // threshold / ( ( this.scale.x + this.scale.y + this.scale.z ) / 3 );
		var position = new THREE.Vector3();
		var pass = 0;
		var testPoint = function ( point, index ) {

			var rayPointDistance = ray.distanceToPoint( point );

			if ( rayPointDistance < localThreshold ) {

				var intersectPoint = ray.closestPointToPoint( point );
				intersectPoint.applyMatrix4( object.matrixWorld );

				var distance = raycaster.ray.origin.distanceTo( intersectPoint );
				pass++;
				
				intersects.push( {

					distance: distance,
					distanceToRay: rayPointDistance,
					point: intersectPoint.clone(),
					index: index,
					face: null,
					object: object

				} );

			}
		};

		var attributes = geometry.attributes;
		var positions = attributes.position.array;

		var start = 0, end = 0;
		
		if(geometry.offsets.length){
			start = geometry.offsets[0].index;
			end = start + geometry.offsets[0].count;
		}
		
		for ( var i = start; i < end; i ++ ) {

			position.set(
				positions[ 3 * i ],
				positions[ 3 * i + 1 ],
				positions[ 3 * i + 2 ]
			);

			testPoint( position, i );
			
			// first one is sufficient
			if(this.fasterRaycast && pass > 0) { 
				break;
			}
		}
	};

}() );

THREE.PixelBox.prototype.encodeRawFrame = function(dataObject, frameNumber){
	var obj = {p:new Array(), n:new Array(), c:new Array(), o:new Array()};
	var ff = this.geometry.data.frameData[0];
	var fd = this.geometry.data.frameData[frameNumber];
	var fdc = (fd.l ? ff.c : fd.c);
	var fdp = (fd.l ? ff.p : fd.p);
	var fdn = (fd.l ? ff.n : fd.n);
	var fdo = (fd.l ? ff.o : fd.o);
	
	var start = (fd.s ? fd.s : 0);
	var end = start + (fd.l ? fd.l : ff.o.length);
	
	var trunc = function(number) {
	  var places = 4;
	  var shift = Math.pow(10, places);
	  return ((number * shift) | 0) / shift;
	};
	
	var hw = this.geometry.data.width * 0.5;
	var hh = this.geometry.data.height * 0.5;
	var hd = this.geometry.data.depth * 0.5;
	
	for(var i = start; i < end; i++){
		if(fdc.array[i * 4 + 3] > 0){
			obj.c.push(trunc(fdc.array[i * 4]), trunc(fdc.array[i * 4 + 1]), trunc(fdc.array[i * 4 + 2]), trunc(fdc.array[i * 4 + 3]));
			//obj.p.push(fdp.array[i * 3] - this.geometry.data.width * 0.5, fdp.array[i * 3 + 1] - this.geometry.data.height * 0.5, fdp.array[i * 3 + 2] - this.geometry.data.depth * 0.5);
			obj.p.push(fdp.array[i * 3] + hw, fdp.array[i * 3 + 1] + hh, fdp.array[i * 3 + 2] + hd);
			obj.n.push(trunc(fdn.array[i * 3]), trunc(fdn.array[i * 3 + 1]), trunc(fdn.array[i * 3 + 2]));
			obj.o.push(trunc(fdo.array[i]));
		}
	}
	dataObject.frames[frameNumber] = obj;
}

/* adds a new frame at frameIndex, populated with solid box of particles width x height x depth */
THREE.PixelBox.prototype.addFrameAt = function(frameIndex){
	var geometry = this.geometry;
	var data = geometry.data;
	var pos = new Array();
	var clr = new Array();
	var nrm = new Array();
	var occ = new Array();
	var currentPivot = new THREE.Vector3();
	if(data.offset){
		currentPivot.set(Math.floor(data.width * 0.5), Math.floor(data.height * 0.5), Math.floor(data.depth * 0.5));
	}
	for(var x = 0; x < data.width; x++){
	for(var y = 0; y < data.height; y++){
	for(var z = 0; z < data.depth; z++){
		pos.push(x - currentPivot.x,
				 y - currentPivot.y,
				 z - currentPivot.z);
		clr.push(1,1,1,1);
		nrm.push(0,1,0);
		occ.push(0);
	}}}
	
	data.frameData.splice(frameIndex, 0, { 	p: new THREE.BufferAttribute(new Float32Array(pos), 3),
							c: new THREE.BufferAttribute(new Float32Array(clr), 4),
							n: new THREE.BufferAttribute(new Float32Array(nrm), 3),
							o: new THREE.BufferAttribute(new Float32Array(occ), 1) });
							
	geometry._frame = -1; // invalidate
};


/* swap frames, used by frame range reverse in editor */
THREE.PixelBox.prototype.swapFrames = function(a, b){
	var geometry = this.geometry;
	var obj = geometry.data.frameData[a];
	geometry.data.frameData[a] = geometry.data.frameData[b];
	geometry.data.frameData[b] = obj;
	geometry._frame = -1; // invalidate
};

/* removes and destroys frame */
THREE.PixelBox.prototype.removeFrameAt = function(frameIndex){
	var geometry = this.geometry;
	var _gl = renderer.webgl.context;
	var data = geometry.data;
	var fdo = data.frameData[frameIndex];
	data.frameData.splice(frameIndex, 1);
	// dealloc the buffers
	for ( var key in fdo ) {
		if ( fdo[key].buffer !== undefined ) {
			_gl.deleteBuffer(fdo[key].buffer);
			delete fdo[key];
		}
	}
	
	geometry._frame = -1; // invalidate
};

/* moves frame to new loc */
THREE.PixelBox.prototype.moveFrame = function(loc, newLoc){
	var geometry = this.geometry;
	var data = geometry.data;
	var fdo = data.frameData[loc];
	data.frameData.splice(loc, 1);
	data.frameData.splice(newLoc, 0, fdo);
	geometry._frame = -1; // invalidate
};

/* 
	updates a frame using supplied data
	frameData is an array of width * height * depth containing {c: color, a: alpha, b: brightness } or null
	returns time took to update in milliseconds
*/

THREE.PixelBox.prototype.replaceFrame = function(frameData, frameIndex){
	var startTime = new Date();
	var geometry = this.geometry;
	var dataObject = geometry.data;
	var smoothNormals = dataObject.smoothNormals != undefined ? dataObject.smoothNormals : 1.0;
	var floor = dataObject.floor != undefined ? dataObject.floor : false;
	var optimize = dataObject.optimize != undefined ? dataObject.optimize : true;

	var width = dataObject.width, height = dataObject.height, depth = dataObject.depth;
	var hw = width * 0.5, hh = height * 0.5, hd = depth * 0.5;

	// helper
	function getNorm(x, y, z, dx, dy, dz){
		x += dx; y += dy; z += dz;
		var addr = (x * depth * height) + (y * depth) + z;
		var oobxz = (x < 0 || z < 0 || x >= width || z >= depth);
		var ooby = (y < 0 || y >= height);
		if(floor && oobxz) return new THREE.Vector3(0,0,0);
		if(oobxz || ooby ||
			!frameData[addr] || frameData[addr].a == 0.0) return new THREE.Vector3(dx,dy,dz);
		return new THREE.Vector3(0,0,0);
	}

	// helper
	function getAlpha(x, y, z){
		var ii = (x * depth * height) + (y * depth) + z;
		
		if(x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;
		
		return frameData[ii] ? frameData[ii].a : 0;
	}
	
	// repopulate buffers
	index = 0;
	var neighbors;
	var totalSolid = 0, optimizeRemoved = 0;
	var colorObj = new THREE.Color();
	var frameBuffers = geometry.data.frameData[frameIndex];
	var emptyObj = { c:0x0, a:0.0, b:0.0 };
	var ax,ay,az,mv;
	var perp = new THREE.Vector3(), normal = new THREE.Vector3(), tilted = new THREE.Vector3();

	for(var x = 0; x < width; x++){
	for(var y = 0; y < height; y++){
	for(var z = 0; z < depth; z++){

		var thisPix = frameData[index] ? frameData[index] : emptyObj;
		if(thisPix.a > 0) totalSolid++;
		
		// collect nearest neighbors
		neighbors = [getAlpha(x - 1, y, z), getAlpha(x + 1, y, z), getAlpha(x, y - 1, z), getAlpha(x, y + 1, z), getAlpha(x, y, z - 1), getAlpha(x, y, z + 1)];
		var numNeighbors = 	Math.floor(neighbors[0]) + Math.floor(neighbors[1]) + Math.floor(neighbors[2]) +
							Math.floor(neighbors[3]) + Math.floor(neighbors[4]) + Math.floor(neighbors[5]);

		// optimize - discard pixel if can't be seen inside the cloud
		if(optimize && numNeighbors == 6 && // <- nearest neighbors
			getAlpha(x - 2, y, z) + getAlpha(x + 2, y, z) + getAlpha(x, y - 2, z) +
			getAlpha(x, y + 2, z) + getAlpha(x, y, z - 2) + getAlpha(x, y, z + 2) == 6 // <- extended neighbors
		){
			frameBuffers.c.array[index * 4 + 3] = 0.0; // set alpha to 0
			optimizeRemoved++;
			index++;			
			continue;
		}
		
		// start normal
		if(numNeighbors > 2){
			if(!floor) normal.set(x - hw, y - hh, z - hd); else normal.set(0, 1, 0);
			normal.normalize().multiplyScalar(0.1);
		} else {
			normal.set(0, 1, 0);
		}
		
		// direct
		normal.add(getNorm(x,y,z, 1, 0, 0));
		normal.add(getNorm(x,y,z, -1, 0, 0));
		normal.add(getNorm(x,y,z, 0, 1, 0));
		normal.add(getNorm(x,y,z, 0, -1, 0));
		normal.add(getNorm(x,y,z, 0, 0, 1));
		normal.add(getNorm(x,y,z, 0, 0, -1));
		
		var weight;
		if(smoothNormals > 0.0){
			// two over
			weight = 0.25 * smoothNormals;
			normal.add(getNorm(x,y,z, 2, 0, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -2, 0, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 2, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, -2, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 0, 2).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 0, -2).multiplyScalar(weight));
	
			// diagonals
			weight = 0.4 * smoothNormals;
			normal.add(getNorm(x,y,z, 1, 1, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 1, 1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 1, 1, 1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -1, -1, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, -1, -1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -1, -1, -1).multiplyScalar(weight));
		}
		
		// normalize
		if(normal.length() == 0) normal.set(0, 1, 0);
		else normal.normalize();
		
		// occlusion
		// sample neighbors first
		var occ = 0.0;
		if(numNeighbors > 2){
			weight = 0.125;
			
			// add direct neighbors
			for(var n = 0; n < 6; n++) occ += neighbors[n];
			occ *= 0.25 / 6.0;
			
			// sample in direction of the normal		
			occ += 1.0 * getAlpha(Math.round(x + normal.x), Math.round(y + normal.y), Math.round(z + normal.z));
			
			// find a perpendicular vector
			ax = Math.abs(normal.x); ay = Math.abs(normal.y); az = Math.abs(normal.z);
			mv = Math.min(ax, ay, az);
			if(mv == ax){
				perp.set(1, 0, 0);
			} else if(mv == ay){
				perp.set(0, 1, 0);
			} else {
				perp.set(0, 0, 1);
			}
			perp.cross(normal).normalize();
			
			// narrow cone
			tilted.copy(normal).applyAxisAngle(perp, Math.PI * 0.2).normalize().multiplyScalar(2);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));

			// wider cone
			tilted.copy(normal).applyAxisAngle(perp, Math.PI * 0.35).normalize().multiplyScalar(3.5);
			occ += weight * 0.5 * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));

			occ /= 3;
		} else {
			occ = -numNeighbors * 0.25;
		}
		frameBuffers.o.array[index] = occ;//THREE.Math.smoothstep(occ, 0, 1);
	
		// store brightness in normal length, after occlusion step
		normal.multiplyScalar(1.0 + thisPix.b);
		 
		// color
		colorObj.set(thisPix.c);
		frameBuffers.c.array[index * 4] = colorObj.r;
		frameBuffers.c.array[index * 4 + 1] = colorObj.g;
		frameBuffers.c.array[index * 4 + 2] = colorObj.b;
		frameBuffers.c.array[index * 4 + 3] = thisPix.a;
		
		// normal
		frameBuffers.n.array[index * 3] = normal.x;
		frameBuffers.n.array[index * 3 + 1] = normal.y;
		frameBuffers.n.array[index * 3 + 2] = normal.z;
				
		index++;	
	}}}
	
	geometry.optimizeRemoved = optimizeRemoved;
	geometry.totalSolid = totalSolid;
	
	frameBuffers.c.needsUpdate = true;
	frameBuffers.n.needsUpdate = true;
	frameBuffers.o.needsUpdate = true;
	
	// return time
	return (new Date()).getTime() - startTime.getTime();
}

/* 	
	merges strokeSet into frame, replacing pixels
	used during a brush stroke in editor  
*/

THREE.PixelBox.prototype.replaceFramePartial = function(strokeSet, frameIndex){
	var geometry = this.geometry;
	var startTime = new Date();
	
	var dataObject = geometry.data;
	var smoothNormals = dataObject.smoothNormals != undefined ? dataObject.smoothNormals : 1.0;
	var floor = dataObject.floor != undefined ? dataObject.floor : false;

	var width = dataObject.width, height = dataObject.height, depth = dataObject.depth;
	var hw = width * 0.5, hh = height * 0.5, hd = depth * 0.5;

	var frameBuffers = geometry.data.frameData[frameIndex];

	// helper
	function getNorm(x, y, z, dx, dy, dz){
		x += dx; y += dy; z += dz;
		var ii = (x * depth * height) + (y * depth) + z;
		if(x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth ) return new THREE.Vector3(dx,dy,dz);
		
		var pixName = x + ',' + y + ',' + z;
		var ssp = strokeSet[pixName];
		var fda = frameBuffers.c.array[ii * 4 + 3];
		if((ssp && (ssp.a == 0.0 || ssp.subtract)) || fda == 0.0) return new THREE.Vector3(dx,dy,dz);
		
		return new THREE.Vector3(0,0,0);
	}

	// helper
	function getAlpha(x, y, z){
		var ii = (x * depth * height) + (y * depth) + z;
		
		if(x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return 0;
		
		var pixName = x + ',' + y + ',' + z;
		var ssp = strokeSet[pixName];
		
		if(ssp) return ssp.subtract ? 0 : ssp.a;
		
		return frameBuffers.c.array[ii * 4 + 3];
	}
	
	// repopulate buffers
	index = 0;
	var neighbors;
	var totalSolid = 0, optimizeRemoved = 0;
	var colorObj = new THREE.Color();
	var emptyObj = { c:0x0, a:0.0, b:0.0 };
	var perp = new THREE.Vector3(), normal = new THREE.Vector3(), tilted = new THREE.Vector3();
	
	var x,y,z;
	
	for(var pixName in strokeSet){
		var thisPix = strokeSet[pixName];
		if(thisPix.subtract) thisPix.a = 0;
		
		x = thisPix.x;
		y = thisPix.y;
		z = thisPix.z;
		index = x * depth * height + y * depth + z;
		
		// collect nearest neighbors
		neighbors = [getAlpha(x - 1, y, z), getAlpha(x + 1, y, z), getAlpha(x, y - 1, z), getAlpha(x, y + 1, z), getAlpha(x, y, z - 1), getAlpha(x, y, z + 1)];
		var numNeighbors = 	Math.floor(neighbors[0]) + Math.floor(neighbors[1]) + Math.floor(neighbors[2]) +
							Math.floor(neighbors[3]) + Math.floor(neighbors[4]) + Math.floor(neighbors[5]);

		// start normal
		if(numNeighbors > 2){
			if(!floor) normal.set(x - hw, y - hh, z - hd); else normal.set(0, 1, 0);
			normal.normalize().multiplyScalar(0.1);
		} else {
			normal.set(0, 1, 0);
		}
		
		// direct
		normal.add(getNorm(x,y,z, 1, 0, 0));
		normal.add(getNorm(x,y,z, -1, 0, 0));
		normal.add(getNorm(x,y,z, 0, 1, 0));
		normal.add(getNorm(x,y,z, 0, -1, 0));
		normal.add(getNorm(x,y,z, 0, 0, 1));
		normal.add(getNorm(x,y,z, 0, 0, -1));
		
		var weight;
		if(smoothNormals > 0.0){
			// two over
			weight = 0.25 * smoothNormals;
			normal.add(getNorm(x,y,z, 2, 0, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -2, 0, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 2, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, -2, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 0, 2).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 0, -2).multiplyScalar(weight));
	
			// diagonals
			weight = 0.4 * smoothNormals;
			normal.add(getNorm(x,y,z, 1, 1, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, 1, 1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 1, 1, 1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -1, -1, 0).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, 0, -1, -1).multiplyScalar(weight));
			normal.add(getNorm(x,y,z, -1, -1, -1).multiplyScalar(weight));
		}
		
		// normalize
		if(normal.length() == 0) normal.set(0, 1, 0);
		else normal.normalize();
		
		// occlusion
		// sample neighbors first
		var occ = 0.0;
		if(numNeighbors > 2){
			weight = 0.125;
			
			// add direct neighbors
			for(var n = 0; n < 6; n++) occ += neighbors[n];
			occ *= 0.25 / 6.0;
			
			// sample in direction of the normal		
			occ += 1.0 * getAlpha(Math.round(x + normal.x), Math.round(y + normal.y), Math.round(z + normal.z));
			
			// find a perpendicular vector
			ax = Math.abs(normal.x); ay = Math.abs(normal.y); az = Math.abs(normal.z);
			mv = Math.min(ax, ay, az);
			if(mv == ax){
				perp.set(1, 0, 0);
			} else if(mv == ay){
				perp.set(0, 1, 0);
			} else {
				perp.set(0, 0, 1);
			}
			perp.cross(normal).normalize();
			
			// narrow cone
			tilted.copy(normal).applyAxisAngle(perp, Math.PI * 0.2).normalize().multiplyScalar(2);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));

			// wider cone
			tilted.copy(normal).applyAxisAngle(perp, Math.PI * 0.35).normalize().multiplyScalar(3.5);
			occ += weight * 0.5 * getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));
			tilted.applyAxisAngle(normal, Math.PI * 0.25);
			occ += weight * 0.5 *getAlpha(Math.round(x + tilted.x), Math.round(y + tilted.y), Math.round(z + tilted.z));

			occ /= 3;
		} else {
			occ = -numNeighbors * 0.25;
		}
		frameBuffers.o.array[index] = occ;//THREE.Math.smoothstep(occ, 0, 1);
	
		// store brightness in normal length, after occlusion step
		normal.multiplyScalar(1.0 + thisPix.b);
		 
		// color
		colorObj.set(thisPix.c);
		frameBuffers.c.array[index * 4] = colorObj.r;
		frameBuffers.c.array[index * 4 + 1] = colorObj.g;
		frameBuffers.c.array[index * 4 + 2] = colorObj.b;
		frameBuffers.c.array[index * 4 + 3] = thisPix.a;
		
		// normal
		frameBuffers.n.array[index * 3] = normal.x;
		frameBuffers.n.array[index * 3 + 1] = normal.y;
		frameBuffers.n.array[index * 3 + 2] = normal.z;
	}
	
	frameBuffers.c.needsUpdate = true;
	frameBuffers.n.needsUpdate = true;
	frameBuffers.o.needsUpdate = true;
	
	// return time
	return (new Date()).getTime() - startTime.getTime();
}
