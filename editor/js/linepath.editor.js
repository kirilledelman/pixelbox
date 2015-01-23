/* Line path additions */

/* cutomized raycast - adjust linePrecision with object scale */
THREE.LinePath.prototype.raycast = function ( raycaster, intersects ) {
	var geometry = this.geometry;

	if ( geometry.boundingSphere === null ) geometry.computeBoundingSphere();

	// Checking boundingSphere distance to ray
	var sphere = new THREE.Sphere();
	sphere.copy( geometry.boundingSphere );
	sphere.applyMatrix4( this.matrixWorld );

	if ( raycaster.ray.isIntersectionSphere( sphere ) === false ) {
		return;
	}

	var inverseMatrix = new THREE.Matrix4();
	inverseMatrix.getInverse( this.matrixWorld );
	var ray = new THREE.Ray();
	ray.copy( raycaster.ray ).applyMatrix4( inverseMatrix );
	
	var pscale = new THREE.Vector3();
	pscale.setFromMatrixScale(inverseMatrix);
	
	var precision = raycaster.linePrecision * Math.min(pscale.x, pscale.y, pscale.z);
	var precisionSq = precision * precision;

	var vStart = new THREE.Vector3();
	var vEnd = new THREE.Vector3();
	var interSegment = new THREE.Vector3();
	var interRay = new THREE.Vector3();
	var step = this.mode === THREE.LineStrip ? 1 : 2;

	var vertices = geometry.vertices;
	var nbVertices = vertices.length;

	for ( var i = 0; i < nbVertices - 1; i += step ) {
		var distSq = ray.distanceSqToSegment( vertices[ i ], vertices[ i + 1 ], interRay, interSegment );
		if ( distSq > precisionSq ) continue;
		var distance = ray.origin.distanceTo( interRay );
		if ( distance < raycaster.near || distance > raycaster.far ) continue;

		intersects.push( {
			distance: distance,
			point: interSegment.clone().applyMatrix4( this.matrixWorld ),
			face: null,
			faceIndex: null,
			object: this
		} );
	}		
};


/* 
	Called when control points have moved (no structural change needed)
	refreshes geometry vertices, and updates path length
*/
THREE.LinePath.prototype.update = function(){
	this.updateMatrixWorld(true);
	
	// update curves points from handles
	for(var i = 0, nc = this.children.length; i < nc; i++){
		// point
		var handle = this.children[i];
		var curve = (handle.curveIndex < this.path.curves.length) ? this.path.curves[handle.curveIndex] : null;
		var prevCurve = (handle.curveIndex > 0) ? this.path.curves[handle.curveIndex - 1] : null;
		if(curve) curve.v0.copy(handle.position);
		if(prevCurve) prevCurve.v3.copy(handle.position);
		
		// control point 1
		var cpHandle = handle.preHandle;
		if(cpHandle.curveIndex >= 0 && cpHandle.curveIndex < this.path.curves.length){
			curve = this.path.curves[cpHandle.curveIndex];
			var pos = cpHandle.position.clone();
			handle.localToWorld(pos);
			this.worldToLocal(pos);
			if(cpHandle.pointIndex == 1) curve.v1.copy(pos);
			else curve.v2.copy(pos);
		}
		
		// control point 2
		var cpHandle = handle.postHandle;
		if(cpHandle.curveIndex >= 0 && cpHandle.curveIndex < this.path.curves.length){
			curve = this.path.curves[cpHandle.curveIndex];
			var pos = cpHandle.position.clone();
			handle.localToWorld(pos);
			this.worldToLocal(pos);
			if(cpHandle.pointIndex == 1) curve.v1.copy(pos);
			else curve.v2.copy(pos);
		}
	}	
	
	// update curves and geometry
	for(var i = 0; i < this.path.curves.length; i++){
		var curve = this.path.curves[i];
		curve.updateArcLengths();
		var points = curve.getPoints(9), ppi = 0;
		for(var pi = i * 10, pic = pi + 10; pi < pic; pi++){
			this.geometry.vertices[pi].copy(points[ppi]);
			ppi++;
		}
	}
	
	// force path to refresh
	if(this.path.cacheLengths) this.path.cacheLengths.length = 0;
	// force geometry to refresh
	this.geometry.verticesNeedUpdate = true;
	this.geometry.boundingSphere = null;
};

/*  called after structural change to the path

	recreates curves to match control points
	recreates geometry to match curves 
*/

THREE.LinePath.prototype.rebuild = function(recreateCurves){
	// remake geometry
	this.geometry.dispose();
	this.geometry = new THREE.Geometry();
	
	var p = this.parent;
	if(p){
		this.parent.remove(this);
		p.add(this);
	}
	
	if(recreateCurves){
		// sort points
		var sortedChildren = this.children.sort(function(a, b){
			if(a.curveIndex < b.curveIndex) return -1;
			if(a.curveIndex > b.curveIndex) return 1;
			if(a.pointIndex < b.pointIndex) return -1;
			if(a.pointIndex > b.pointIndex) return 1;
			return 0;
		});
		
		this.path.curves.length = 0;
		if(this.path.cacheLengths) this.path.cacheLengths.length = 0;
		
		for(var i = 0, nc = sortedChildren.length - 1; i < nc; i++){
			var p0 = sortedChildren[i];
			var p3 = sortedChildren[i+1];
			
			var curve = new THREE.CubicBezierCurve3();
			curve.v0 = p0.position.clone();
			curve.v3 = p3.position.clone();
			
			var pos = p0.localToWorld(p0.postHandle.position.clone());
			curve.v1 = this.worldToLocal(pos);
			pos = p3.localToWorld(p3.preHandle.position.clone());
			curve.v2 = this.worldToLocal(pos);
			this.path.add(curve);
		}
		
	}
	
	// recreate verts
	for(var i = 0, nc = this.path.curves.length; i < nc; i++){
		var curve = this.path.curves[i];
		var points = curve.getPoints(9);
		//if(i > 0) points.splice(0, 1); // skip first vertex on i > 0
		this.geometry.vertices = this.geometry.vertices.concat(points);
	}
}

/* LinePath point handle in editor */

THREE.LinePathHandle = function (color){

	THREE.PixelBox.call(this, THREE.LinePathHandle.prototype.pbPoint);

	this.origColor = color;
	this.tint.setHex(color);
	this.castShadow = false;
	this._selected = false;
	this._lockTangents = false;
	this.cullBack = false;
	
	Object.defineProperty(this, 'selected',{
		get:function(){ return this._selected; },
		set:function(s){ 
			this._selected = s; 
			this.tint.setHex(s ? 0xFFFFFF : (this.parent && this.parent.lockTangents ? 0x006699 : this.origColor));
		}
	});
	Object.defineProperty(this, 'lockTangents',{
		get:function(){ return this._lockTangents; },
		set:function(s){ 
			this._lockTangents = s; 
			for(var i = 0; i < this.children.length; i++){
				this.children[i].selected = this.children[i]._selected;//refresh tint
			}
		}
	});
		
	return this;
};

THREE.LinePathHandle.prototype = Object.create(THREE.PixelBox.prototype);
THREE.LinePathHandle.prototype.constructor = THREE.PixelBox;

/* fix sprite raycast to use sprite scale */
THREE.LinePathHandle.prototype.raycast = ( function () {

	var matrixPosition = new THREE.Vector3();
	var matrixScale = new THREE.Vector3();

	return function ( raycaster, intersects ) {

		matrixPosition.setFromMatrixPosition( this.matrixWorld );
		matrixScale.setFromMatrixScale( this.matrixWorld );

		var distance = raycaster.ray.distanceToPoint( matrixPosition );

		if ( distance > Math.min(matrixScale.x, matrixScale.y, matrixScale.z) * this.pointSize) {
			return;
		}

		intersects.push( {
			distance: distance,
			point: matrixPosition.clone(),
			face: null,
			object: this
		} );
	};

}() );

THREE.LinePathHandle.prototype.updateMatrix = function(){
	var pscale = new THREE.Vector3();
	return function(){
		this.matrix.compose( this.position, this.quaternion, this.scale );
		this.matrixWorldNeedsUpdate = true;
		pscale.setFromMatrixScale(this.matrixWorld);
		this.pointSize = 4 / Math.max(pscale.x, pscale.y, pscale.z);
	};
}();

THREE.LinePathHandle.prototype.pbPoint = {width:1,height:1,depth:1,frames:["ffffffff"],pointSize:4,anchors:{},anims:[],meta:0};
THREE.LinePath.prototype.sharedMaterial = new THREE.LineBasicMaterial( { color: 0x999999, fog: true } );
THREE.LinePath.prototype.sharedSelectedMaterial = new THREE.LineBasicMaterial( { color: 0xffffff, fog: false, linewidth: 2 } );

/* helper for parented lights fixes */

THREE.SpotLightHelper.prototype.update = function(){

	var vector = new THREE.Vector3();
	var vector2 = new THREE.Vector3();
	
	return function(){
		// update cone like before
		var coneLength = this.light.distance ? this.light.distance : 10000;
		var coneWidth = coneLength * Math.tan( this.light.angle );
	
		this.cone.scale.set( coneWidth, coneWidth, coneLength );
	
		vector.setFromMatrixPosition( this.light.matrixWorld );
		vector2.setFromMatrixPosition( this.light.target.matrixWorld );
	
		this.cone.lookAt( vector2.sub( vector ) );
	
		this.cone.material.color.copy( this.light.color ).multiplyScalar( this.light.intensity );
	
		// reset matrix - fixes spotlights under rotated parents
		if(this.matrix == this.light.matrixWorld){
			this.matrix = new THREE.Matrix4();
		}
		
		this.position.copy(vector);
		this.updateMatrix(true);
	}
}();

THREE.DirectionalLightHelper.prototype.update = function () {

	var v1 = new THREE.Vector3();
	var v2 = new THREE.Vector3();
	var v3 = new THREE.Vector3();

	return function () {

		v1.setFromMatrixPosition( this.light.matrixWorld );
		v2.setFromMatrixPosition( this.light.target.matrixWorld );
		v3.subVectors( v2, v1 );

		this.lightPlane.lookAt( v3 );
		this.lightPlane.material.color.copy( this.light.color ).multiplyScalar( this.light.intensity );

		this.targetLine.geometry.vertices[ 1 ].copy( v3 );
		this.targetLine.geometry.verticesNeedUpdate = true;
		this.targetLine.material.color.copy( this.lightPlane.material.color );

		// reset matrix - fixes spotlights under rotated parents
		if(this.matrix == this.light.matrixWorld){
			this.matrix = new THREE.Matrix4();
		}
		
		this.position.copy(v1);
		this.updateMatrix(true);

	};

}();
