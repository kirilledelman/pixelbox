/*
 * @author Kirill Edelman
 * @source https://github.com/kirilledelman/pixelbox
 * @documentation https://github.com/kirilledelman/pixelbox/wiki
 * @license MIT
*/

/* ================================================================================ Util */

/* easing: t = current time, b = start value, c = change in value, d = duration */
Math.easeInOutSine = function ( t, b, c, d ) { return -c * 0.5 * (Math.cos( Math.PI * t / d ) - 1) + b; };

Math.easeInSine = function ( t, b, c, d ) { return -c * Math.cos( t / d * Math.PI * 0.5 ) + c + b; };

Math.easeOutSine = function ( t, b, c, d ) { return c * Math.sin( t / d * Math.PI * 0.5 ) + b; };

Math.linearTween = function ( t, b, c, d ) { return c * t / d + b; };

/* pseudo - random number */
Math.seededRandom = function ( seed ) {

	var x = Math.sin( seed + 1 ) * 10000;
	return x - Math.floor( x );
	
};

/* deep clone */
function _deepClone( obj, depth ) {

	if ( typeof obj !== 'object' ) return obj;
	if ( obj === null) return null;
	if ( _.isString( obj ) ) return obj.splice();
	if ( _.isDate( obj ) ) return new Date( obj.getTime() );
	if ( _.isFunction ( obj.clone ) ) return obj.clone();
	var clone = _.isArray( obj ) ? obj.slice() : _.extend( {}, obj );
	// clone array's extended props
	if ( _.isArray( obj ) ) {
	
		for ( var p in obj ) {
		
			if ( obj.hasOwnProperty( p ) && _.isUndefined( clone[ p ] ) && isNaN( p ) ) clone[ p ] = obj[ p ];
			
		}
		
	}
	if ( !_.isUndefined( depth ) && ( depth > 0 ) ) {
	
	  for ( var key in clone ) {
	  
	    clone[ key ] = _deepClone( clone[ key ], depth - 1 );
	    
	  }
	  
	}
	
	return clone;
	
};

/* ================================================================================ Object3D extensions */


THREE.Object3D.prototype.nearestParentWithProperty = function ( prop, val ) {

	if ( this.parent ) {
	
		if ( this.parent[ prop ] && (val === undefined || this.parent[ prop ] === val) ) return this.parent;
		
		return this.parent.nearestParentWithProperty( prop, val );
		
	}
	
	return null;
	
}

THREE.Object3D.prototype.nearestParentWithoutProperty = function ( prop ) {

	if ( this.parent ) {
	
		if ( this.parent[ prop ] === undefined ) return this.parent;
		
		return this.parent.nearestParentWithoutProperty( prop );
		
	}
	
	return null;
	
}

THREE.Object3D.prototype.isVisibleRecursive = function () {

	if ( !this.visible ) return false;
	
	if ( this.parent ) return this.parent.isVisibleRecursive();
	
	return this.visible;	
}

/* another can be an array or a single object */
THREE.Object3D.prototype.isDescendantOf = function ( another ) {

	if ( !this.parent ) return false;
	
	if ( _.isArray( another ) ) {
	
		for ( var i = 0, l = another.length; i < l; i++ ) {
		
			var ai = another[ i ];
			if ( this.parent == ai ) return true;
			var p = this.parent.isDescendantOf( ai );
			if ( p ) return true;
			
		}
		
		return false;
		
	} else {
	
		if ( this.parent == another ) return true;
		return this.parent.isDescendantOf( another );
		
	}
}

/* if object is a descendent of an instance, returns that instance */
THREE.Object3D.prototype.parentInstance = function () {

	if ( this.isInstance ) return this;
	
	if ( !this.parent ) return null;
	
	return this.parent.parentInstance();
	
};

/* if object is a descendent of a template, returns that template */
THREE.Object3D.prototype.nearestTemplate = function () {

	if ( this.isTemplate ) return this;
	
	return this.nearestParentWithProperty( 'isTemplate', true );
	
};

/* 
   removes / dismantles object hierarchy (skips objects in omit array and doesn't remove anchors)
   returns all objects affected
   
   used when recycling objects
*/

THREE.Object3D.prototype.recursiveRemoveChildren = function ( omit ) {

	var removedChildren = [];
	
	for ( var i = this.children.length - 1; i >= 0; i-- ) {
	
		var child = this.children[ i ];
		
		if ( omit && omit.indexOf( child ) !== -1) continue;
		
		removedChildren = removedChildren.concat(child.recursiveRemoveChildren( omit ));
		if ( child.stopTweens ) child.stopTweens();
		if ( child.stopAnim ) child.stopAnim();
		if ( child['name'] ) {
		
			if ( child.anchored && this.parent[ child.name ] && this.parent[ child.name ] == child ) {
			
				delete this.parent[child.name];
				
			} else if ( this[ child.name ] == child ) {
			
				delete this[ child.name ];
				
			}
			
		}
		
		if ( !child.isAnchor ) {
		
			this.remove( child );
			removedChildren.push( child );
			
		}
		
	}
	
	return removedChildren;
	
};

THREE.Object3D.prototype.getObjectByUUID = function ( uuid, recursive ) {

	if ( this.uuid === uuid ) return this;

	for ( var i = 0, l = this.children.length; i < l; i ++ ) {
		var child = this.children[ i ];
		var object = child.getObjectByUUID( uuid, recursive );
		if ( object !== undefined ) {
		
			return object;
			
		}
		
	}
	
	return undefined;
	
};

THREE.Object3D.prototype.removeFromParent = function () {

	if ( !this.parent ) return false;
	this.parent.remove( this );
	return true;
	
};

THREE.Object3D.prototype.lookAtObject = function ( other ) {

	var objWorldPosition = other.parent ? other.parent.localToWorld( other.position.clone() ) : other.position.clone();
	this.lookAt( this.parent ? this.parent.worldToLocal( objWorldPosition ) : objWorldPosition );
	
};

THREE.Object3D.prototype.transplant = function ( newParent ) {

	if ( newParent.isDescendantOf( this ) ) {
	
		console.error( "Can't transplant this object to its descendant." );
		return;
		
	}
	
	// convert transform to world
	this.matrix.copy( this.matrixWorld );
	this.matrix.decompose( this.position, this.quaternion, this.scale );
	this.rotation.setFromQuaternion( this.quaternion );
	
	// parent to new parent
	var inv = new THREE.Matrix4();
	inv.getInverse( newParent.matrixWorld );
	inv.multiply( this.matrix );
	this.matrix.copy( inv );
	
	// refresh pos/rot/sc
	this.matrix.decompose( this.position, this.quaternion, this.scale );
	this.rotation.setFromQuaternion( this.quaternion );
	
	newParent.add( this );
	
};

/* 
	Tweening functions:
	
	Tweens are automatically paused/resumed when renderer.pause(bPause) is called
	Tweening is done at .tweenFps rate (default is 30 frames per second)
	If you wish to stop tweens, keep a reference to the object you passed to tween(obj) function, and call stopTween(obj) later
	
	Example use:
	
	potato.tween({ prop:"alpha", from: 1, to: 0, duration: 1.0 })
	potato.tween({ target: potato.position, from: potato.position, to: vec3, duration: 1.0, done: someFunc })
	parameters:
	(Object) target - 	if target is not given, it defaults to this PixelBox instance
						if is THREE.Vector3 or THREE.Euler or THREE.Color - tween will interpolate target to "to" param
						if target is another object, property "prop" is also required and will be interpolated
	
	(Number) duration - (optional) duration of interpolation, defaults to 1 sec
	(INT) fps - tween FPS
	(same type as target property) from - (optional) starting value, defaults to current value
	(Function) done - (optional) on complete function
	(Function) easing - (optional) easing func of form: function (t, b, c, d), where t = current time, b = start value, c = change in value, d = duration
	(more functions at http://gizma.com/easing) There are a few Math.* after the tween functions
	
*/

THREE.Object3D.prototype.applyTween = function ( tweenObj ) {

	if ( tweenObj.prop ) {

		tweenObj.target[ tweenObj.prop ] =
			tweenObj.easing( tweenObj.time, tweenObj.from, tweenObj.to - tweenObj.from, tweenObj.duration );

	} else if ( tweenObj.target instanceof THREE.Color ) {
	
		tweenObj.target.r = tweenObj.easing( tweenObj.time, tweenObj.from.r, tweenObj.to.r - tweenObj.from.r, tweenObj.duration );
		tweenObj.target.g = tweenObj.easing( tweenObj.time, tweenObj.from.g, tweenObj.to.g - tweenObj.from.g, tweenObj.duration );
		tweenObj.target.b = tweenObj.easing( tweenObj.time, tweenObj.from.b, tweenObj.to.b - tweenObj.from.b, tweenObj.duration );
		
	} else if ( tweenObj.target instanceof THREE.Vector3 ) {
	
		tweenObj.target.set(
			tweenObj.easing( tweenObj.time, tweenObj.from.x, tweenObj.to.x - tweenObj.from.x, tweenObj.duration ),
			tweenObj.easing( tweenObj.time, tweenObj.from.y, tweenObj.to.y - tweenObj.from.y, tweenObj.duration ),
			tweenObj.easing( tweenObj.time, tweenObj.from.z, tweenObj.to.z - tweenObj.from.z, tweenObj.duration )
		);
		
	} else if ( tweenObj.target instanceof THREE.Euler ) {
	
		tweenObj.target.set(
			tweenObj.easing( tweenObj.time, tweenObj.from.x, tweenObj.to.x - tweenObj.from.x, tweenObj.duration ),
			tweenObj.easing( tweenObj.time, tweenObj.from.y, tweenObj.to.y - tweenObj.from.y, tweenObj.duration ),
			tweenObj.easing( tweenObj.time, tweenObj.from.z, tweenObj.to.z - tweenObj.from.z, tweenObj.duration ), 'XYZ'
		);
		
	}
	
}

THREE.Object3D.prototype.advanceTweenFrame = function ( deltaTime ) {

	var nextFrameIn = 1 / 60;
	var keepGoing = true;

	if ( !renderer.paused ) {
		this._tweenInterval = 0;
		for ( var i = this._tweens.length - 1; i >= 0; i-- ) {
		
			var tweenObj = this._tweens[ i ];

			if ( tweenObj.delay > 0 ) {

				tweenObj.delay -= deltaTime;

				if ( tweenObj.start && tweenObj.delay <= 0 ) {

					tweenObj.start( tweenObj );

				}
				continue;

			}

			tweenObj.time = Math.min( tweenObj.time + deltaTime, tweenObj.duration );

			this.applyTween( tweenObj );

			if ( tweenObj.time >= tweenObj.duration ) {
				
				// loop
				if ( tweenObj.numLoops > 0 ) {
				
					tweenObj.numLoops--;
					if ( tweenObj.autoReverse ) {
					
						var temp = tweenObj.to;
						tweenObj.to = tweenObj.from;
						tweenObj.from = temp;
						
					}
					
					if ( tweenObj.loop !== undefined ) tweenObj.loop.call( this, tweenObj );
					tweenObj.time = 0;
					
				// finish tween
				} else {
				
					if ( tweenObj.done !== undefined ) tweenObj.done.call( this, tweenObj );
					this._tweens.splice( i, 1 );
					
				}
				
			}
					
		}
		
		keepGoing = this._tweens.length > 0;
		
	}
	
	// set up next time
	if ( keepGoing ) {
	
		this._tweenInterval = true;
		renderer.tweenQueue.enqueue( this.advanceTweenFrame, nextFrameIn );
		
	} else {
		
		this._tweenInterval = false;
		
	}
	
};

THREE.Object3D.prototype.tween = function ( obj ) {

	var objs;
	if ( !_.isArray( obj ) ) objs = [ obj ];
	else objs = obj;
	
	// first time
	if ( !this.hasOwnProperty( 'advanceTweenFrame' ) ) {
	
		this._tweens = [];
		this.advanceTweenFrame = this.advanceTweenFrame.bind( this );
		
	}
	
	for ( var i = objs.length - 1; i >= 0; i-- ) {
	
		var tweenObj = objs[ i ];
		tweenObj.time = 0;
		
		// validate
		if ( tweenObj.duration === undefined ) tweenObj.duration = 1.0;
		
		if ( tweenObj.target === undefined ) tweenObj.target = this;
		
		if ( tweenObj.easing === undefined ) tweenObj.easing = Math.linearTween;
		
		if ( tweenObj.numLoops === undefined ) tweenObj.numLoops = 0;

		if ( tweenObj.delay === undefined ) tweenObj.delay = 0;
		
		if ( tweenObj.from === undefined ) {
		
			if ( ( tweenObj.target instanceof THREE.Color || tweenObj.target instanceof THREE.Vector3 || tweenObj.target instanceof THREE.Euler ) && !tweenObj.prop ) {
			
				tweenObj.from = tweenObj.target.clone();
				
			} else if ( tweenObj.prop && tweenObj.target[ tweenObj.prop ] ) {
			
				tweenObj.from = _deepClone( tweenObj.target[ tweenObj.prop ] );
				
			} else {
			
				tweenObj.from = 0;
				
			}
			
		}
		
		if ( tweenObj.by !== undefined ) {

			tweenObj.to = tweenObj.from + tweenObj.by;

		} else if ( tweenObj.to === undefined ) {
		
			console.log( "tween object \'to\' parameter is missing: ", tweenObj );
			objs.splice( i, 1 );
			continue;
			
		}
		
	}
	
	this._tweens = this._tweens.concat( objs );

	this._tweenInterval = true;	
	renderer.tweenQueue.enqueue( this.advanceTweenFrame, 1 / 60 );
	
	return objs;
	
};

/* stops all tweens */
THREE.Object3D.prototype.stopTweens = function ( snapToFinish, callDone ) {

	if ( !this._tweens ) return;
	if ( snapToFinish ) {
	
		for ( var i = 0, l = this._tweens.length; i < l; i++ ) {
		
			var tweenObj = this._tweens[ i ];
			tweenObj.time = tweenObj.duration;
			this.applyTween( tweenObj );
			if ( callDone && tweenObj.done !== undefined ) tweenObj.done.call( this, tweenObj ); 
		}
		
	}
	
	this._tweens.length = 0;
	delete this._tweens;
	this._tweens = [];
	
	this._tweenInterval = false;
	renderer.tweenQueue.cancel( this.advanceTweenFrame );
	
};

/* stops specific tween */
THREE.Object3D.prototype.stopTween = function ( obj, snapToFinish, callDone ) {

	if ( !this._tweens ) return;
	var index = this._tweens.indexOf( obj );
	if ( index !== -1 ) {
	
		if ( snapToFinish ) {
		
			var tweenObj = this._tweens[ index ];
			tweenObj.time = tweenObj.duration;
			this.applyTween( tweenObj );
			if ( callDone && tweenObj.done !== undefined ) tweenObj.done.call( this, tweenObj );
			
		}
		
		this._tweens.splice( index, 1 );
		
	}
	
	if ( !this._tweens.length ) {
		
		this._tweenInterval = false;
		renderer.tweenQueue.cancel( this.advanceTweenFrame );
		
	}
	
};

/* ================================================================================ CANNON.js hooks */

/* called by 'added' handler to add physics body and constraints to world */
THREE.Object3D.prototype.addBodyAndConstraintsToWorld = function ( world ) {
	
	var body = this.body;
	
	if ( body ) {
	
		if ( world.bodies.indexOf ( body ) < 0 ) world.addBody( body );
		
		for ( var i = 0, l = body.constraints.length; i < l; i++ ) { 
			
			var constraint = body.constraints[ i ];
			
			if ( world.constraints.indexOf ( constraint ) < 0 ) { 
			
				// also check if other body in the constraint has been added
				
				var otherBody = (constraint.bodyA == body ? constraint.bodyB : constraint.bodyA);
			
				if ( otherBody.world ) {
				
					world.addConstraint( constraint );
				
				}
				
			}
			
		}
		
		// collision callbacks
		if ( !body.hasEventListener( 'collide', world.collideEventDispatch ) ) body.addEventListener( 'collide', world.collideEventDispatch );
	
	}
	
	for ( var i = 0; i < this.children.length; i ++) {
			
		this.children[ i ].addBodyAndConstraintsToWorld( world );
		
	}
	
};

/* called by 'removed' handler to remove physics body and constraints from world */
THREE.Object3D.prototype.removeBodyAndConstraintsFromWorld = function ( world ) {
	
	var body = this.body;
	
	if ( body ) {
		
		// remove body
		world.remove( body );
		
		// remove this body's collision event
		body.removeEventListener( 'collide', world.collideEventDispatch );
		
		// remove constraints
		for ( var i = body.constraints.length - 1; i >= 0; i-- ) {
			
			var constraint = body.constraints[ i ];
			var otherBody = (constraint.bodyA == body ? constraint.bodyB : constraint.bodyA);
			world.removeConstraint( constraint );
			
			if ( otherBody ) {
			
				var index = otherBody.constraints.indexOf( constraint );
				if ( index >= 0 ) otherBody.constraints.splice( index, 1 );
				
			}		
			
		}
		
		body.constraints.length = 0;
		this.body = null;
		
		for ( var i = 0; i < this.children.length; i ++) {
			
			this.children[ i ].removeBodyAndConstraintsFromWorld( world );
			
		}
		
	}
	
};

/* copies this objects position and rotation to physics body */
THREE.Object3D.prototype.syncBody = function () {
	
	var worldPos = new THREE.Vector3(), worldScale = new THREE.Vector3();
	var worldQuat = new THREE.Quaternion();
	
	return function () {
		if ( !this.body ) return;
		
		this.matrixWorldNeedsUpdate = true;
		this.updateMatrixWorld();
		
		this.matrixWorld.decompose( worldPos, worldQuat, worldScale );
		
		this.body.position.set( worldPos.x, worldPos.y, worldPos.z );
		this.body.quaternion.set( worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w );
		
	};
	
}();

/* copies this objects position and rotation to physics body */
THREE.Object3D.prototype.syncToBody = function () {

	var mat = new THREE.Matrix4();
	var worldPos = new THREE.Vector3(), worldScale = new THREE.Vector3();
	var worldQuat = new THREE.Quaternion();
	
	return function () {
		
		if ( !this.body || !this.parent ) return;
		
		this.matrix.getInverse( this.parent.matrixWorld );
			
		worldScale.setFromMatrixScale( this.matrixWorld );
						
		mat.compose( this.body.position, this.body.quaternion, worldScale );
		this.matrix.multiply( mat );
		
		this.matrix.decompose( this.position, this.quaternion, this.scale );
		this.rotation.setFromQuaternion( this.quaternion );
		
		this.updateWorldMatrix();
		
	};

}();





