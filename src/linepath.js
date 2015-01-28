/*
 * @author Kirill Edelman
 * @source https://github.com/kirilledelman/pixelbox
 * @documentation https://github.com/kirilledelman/pixelbox/wiki
 * @license MIT
*/

THREE.LinePath = function () {
	
	THREE.Line.call( this, new THREE.Geometry(), THREE.LinePath.prototype.sharedMaterial );
	
	this.path = new THREE.CurvePath();
	this.type = THREE.LineStrip;
	
	return this;
	
};

THREE.LinePath.prototype = Object.create( THREE.Line.prototype );
THREE.LinePath.prototype.constructor = THREE.LinePath;

/* creates the segments from definition */
THREE.LinePath.prototype.initialize = function ( objDef ) {

	var lastPoint = null, srg, curve;
	for ( var i = 0, l = objDef.segments.length; i < l; i++ ) {
	
		seg = objDef.segments[ i ];

		curve = new THREE.CubicBezierCurve3(
			lastPoint ? lastPoint : (new THREE.Vector3()).fromArray( seg.v0 ),
			(new THREE.Vector3()).fromArray( seg.v1 ),
			(new THREE.Vector3()).fromArray( seg.v2 ),
			(new THREE.Vector3()).fromArray( seg.v3 )
		);

		curve.v0.lockTangents = (seg.v0.length > 3);
		curve.v3.lockTangents = (seg.v3.length > 3);
		curve.v0.meta = curve.v0.meta ? curve.v0.meta : seg.metaStart;
		curve.v3.meta = seg.metaEnd;

		lastPoint = curve.v3;

		this.path.add( curve );
	}
	
	this.isLoop = this.path.curves[ 0 ].v0.equals( this.path.curves[ this.path.curves.length - 1 ].v3 );

};

/* overridden, to save lastGetPointCurveIndex */
THREE.LinePath.prototype.getPoint = function ( t ) {

	var d = t * this.path.getLength();
	var curveLengths = this.path.getCurveLengths();
	var i = 0, diff, curve;
	while ( i < curveLengths.length ) {
	
		if ( curveLengths[ i ] >= d ) {
		
			diff = curveLengths[ i ] - d;
			curve = this.path.curves[ i ];
			var u = 1 - diff / curve.getLength();
			this.lastGetPointCurveIndex = i;
			return curve.getPointAt( u );
		}
		
		i++;
		
	}
	
	return null;
	
};

/* reverses path direction */
THREE.LinePath.prototype.reverse = function () {

	this.path.curves.reverse();
	for ( var i = 0, nc = this.path.curves.length; i < nc; i++ ) {
	
		var curve = this.path.curves[ i ];
		var temp = curve.v0;
		curve.v0 = curve.v3;
		curve.v3 = temp;
		temp = curve.v1;
		curve.v1 = curve.v2;
		curve.v2 = temp;
		
	}
	
	if ( this.path.cacheLengths ) this.path.cacheLengths.length = 0;
	
};

/* tweens */
THREE.LinePath.prototype.applyTween = function ( tweenObj ) {
	
	var valueChange = tweenObj.to - tweenObj.from;
	var t = tweenObj.easing( tweenObj.time, tweenObj.from, valueChange, tweenObj.duration );
	
	// global position at t
	var modt = t % 1.0;
	var pos = this.getPoint( modt );
	var delta = Math.sign( valueChange ) * 0.0001;
	this.localToWorld( pos );
	
	// detect curve change
	var meta1 = null;
	var meta2 = null;
	if ( this.lastGetPointCurveIndex != tweenObj.currentCurveIndex ) {
	
		var curve = this.path.curves[ this.lastGetPointCurveIndex ];
		var prevCurve = (tweenObj.currentCurveIndex !== undefined) ? this.path.curves[ tweenObj.currentCurveIndex ] : null;
		tweenObj.currentCurveIndex = this.lastGetPointCurveIndex;
		if ( valueChange > 0 ) {
		
			if ( curve.v0.meta ) meta1 = curve.v0.meta;
			if ( prevCurve && prevCurve.v3.meta && prevCurve.v3 != curve.v0 ) meta2 = prevCurve.v3.meta;
			
		} else {
		
			if ( curve.v3.meta ) meta1 = curve.v3.meta;
			if ( prevCurve && prevCurve.v0.meta && prevCurve.v0 != curve.v3 ) meta2 = prevCurve.v0.meta;
			
		}
	}
	
	if ( meta1 ) {
	
		if ( tweenObj.meta ) tweenObj.meta.call( this, tweenObj, meta1 );
		var ev = { type:'path-meta', tweenObject: tweenObj, meta: meta1 };
		tweenObj.target.dispatchEvent( ev );
		this.dispatchEvent( ev );
		
	}
	
	if ( meta2 ) {
	
		if ( tweenObj.meta ) tweenObj.meta.call( this, tweenObj, meta2 );
		var ev = { type:'path-meta', tweenObject: tweenObj, meta: meta2 };
		tweenObj.target.dispatchEvent( ev );
		this.dispatchEvent( ev );
		
	}
	
	var targetParent = tweenObj.target.parent;
	if ( targetParent ) {
	
		tweenObj.target.parent.worldToLocal( pos );
		
	}
	
	// set position
	var prevPosition = tweenObj.target.position.clone();
	tweenObj.target.position.copy( pos );
	
	// orient to path
	var incTime = modt + delta;
	var prevRotation = tweenObj.target.rotation.clone();
	if ( tweenObj.orientToPath && incTime > 0 && (this.isLoop || incTime <= 1.0) ) {
	
		var tangent = this.getPoint( incTime % 1.0 );
		this.localToWorld( tangent );
		
		if ( targetParent ) {
		
			targetParent.worldToLocal( tangent );
			
		}
		
		tweenObj.target.lookAt( tangent );
		
	}
	
	tweenObj.target.syncBody();
	
};

THREE.LinePath.prototype.tween = function ( obj ) {

	var objs;
	if ( !_.isArray( obj ) ) objs = [ obj ];
	else objs = obj.concat();
	
	for ( var i = objs.length - 1; i >= 0; i-- ) {
	
		var tweenObj = objs[ i ];
		
		if ( tweenObj.target === undefined ) {
		
			console.log( "tween object \'target\' parameter is missing: ", tweenObj );
			objs.splice( i, 1 );
			continue;
			
		} else if ( !(tweenObj.target instanceof THREE.Object3D) ) {
		
			console.log( "tween object \'target\' must be a descendant of THREE.Object3D: ", tweenObj );
			objs.splice( i, 1 );
			continue;
			
		} if ( this.isDescendantOf( tweenObj.target ) ) {
		
			console.log( "tween object \'target\' must not be a parent/ascendant of this THREE.LinePath instance: ", tweenObj );
			objs.splice( i, 1 );
			continue;
			
		}

	}	
	
	return THREE.Object3D.prototype.tween.call( this, objs );
	
};