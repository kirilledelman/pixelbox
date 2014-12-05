/*

	Next:
	
	Change "body" to window.body - for easy HTML transplant
	
	When reached the end - snow becomes confetti

	Bulldoser moving snow
	
	Dynamic elements:
		Cloud
		Bunny hopping
	
	Deer standing
	Wolf standing
	
	Roads
	
	parked cars
		
	Tunnel
	
	Lake
	
	? Quitting right before level end will display summary screen in home menu


	AFTER SUBMISSION
	
	Create github repo
	Contact mrdoob - tell him about project, repo
	Add sound to game in HTML, ios. hooks
	
*/

DEBUG_CAMERA = false;

function GameScene(){
	Scene.call(this); // parent constructor
	
/* hud */

	this.showHUD = function(){
		if(!this.hud){
			this.hud = 
			$('<div id="hud-menu" class="menu current">\
			<span id="score"></span><a id="pause-game"></a></div>');//&#10074;&#10074;
			this.summary =
			$('<div id="game-over"><h2>Success!</h2>\
			<p>You delivered <span id="delivered">all</span> of the presents on time!</p>\
			<p class="stat">Delivered <span id="num-delivered"></span></p>\
			<p class="stat">Missed <span id="num-missed"></span></p>\
			<p class="stat">Wasted <span id="num-wasted"></span></p>\
			<p class="stat">Traveled <span id="num-distance"></span></p>\
			<p class="stat">Haste <span id="num-haste"></span></p>\
			<p>Final score<span id="final-score">0000</span></p>\
			<p id="new-best">NEW BEST SCORE!</p>\
			<hr/>\
			<p><a id="exit-game" class="fat">BACK</a></p>\
			</div>');
			this.menu = 
			$('<div id="pause-menu" class="menu current">\
			<p>Slide your finger left and right to steer Santa\'s sled and avoid obstacles.</p>\
			<p><img src="images/icoSlide.png" class="img1"/></p>\
			<p>Tap to drop presents into chimneys.</p>\
			<p><img src="images/icoTap.png" class="img2"/></p>\
			<hr/>\
			<p><a id="quit-game" class="fat">QUIT</a></p>\
			<div class="icicle"/>\
			</div>');
			var f = function(e){
				$('#hohoho').remove();
				e.preventDefault();
				e.stopPropagation();
				gameScene.touchDown = null;
				if(!renderer.paused){
					if(!gameScene.levelComplete){
						$('body').append(gameScene.menu);
						$('#pause-game').addClass('on');
						$('#hud-menu').removeClass('current');
						ios.loopSound('', 0);
						ios.playSound('pause', 0.7);
					}
					renderer.pause(true);
					gameScene.enableTouchEvents(false);
				} else {
					if(!gameScene.levelComplete){
						gameScene.menu.detach();
						$('#pause-game').removeClass('on');
						$('#hud-menu').addClass('current');
						ios.playSound('close', 0.7);
						if(!gameScene.crashed && gameScene.inAir) ios.loopSound('sleigh', gameScene.tunneling ? 0.02 : 0.1);
					}
					renderer.pause(false);
					gameScene.enableTouchEvents(true);
				}
			};
			$('#pause-game', this.hud).on('touchstart click', f);
			
			f = function(e){
				if($(this).attr('disabled')) return;
				$(this).attr('disabled','disabled');
				e.preventDefault();
				e.stopPropagation();
				renderer.pause(true);
				ios.loopSound('', 0);
				ios.playSound('chirp1', 0.5);
				if(e.target.id == 'exit-game') { 
					gameScene.showFinalScore(true);
				} else {
					this.quit = true;
				}
				setTimeout(function(){
					$('#hohoho').remove();
					renderer.pause(false);
					ios.playSound('exit', 0.5, 0.7);
					renderer.setScene(window.menuScene, 2);
				}, 500);
			};
			$('#quit-game', this.menu).on('touchstart click', f);
			$('#exit-game', this.summary).on('touchstart click', f);
		}
		$('body').append(this.hud);
		this.hud.show();
		$('#quit-game', this.menu).removeAttr('disabled');
		$('#exit-game', this.summary).removeAttr('disabled');
		$('#pause-game').removeClass('on');
		$('#hud-menu').addClass('current').removeClass('slideDown').addClass('slideDown');
		this.score = this._score;
	};
	
/* touch events */

	this.enableTouchEvents = function(enable){
		if(enable){
			$('body').on('touchstart.menu mousedown.menu', this.onTouchStart);
			$('body').on('touchmove.menu mousemove.menu', this.onTouchMove);
			$('body').on('touchend.menu mouseup.menu', this.onTouchEnd);
			$('body').on('touchcancel.menu', this.onTouchEnd);
			if(DEBUG_CAMERA) $('body').on('keydown.menu', this.onKeyDown);
		} else {
			$('body').off('.menu');
		}
	};
	
	this.onKeyDown = function(e){
		if(DEBUG_CAMERA) { 
			this.targetTravelSpeed = this.travelSpeed = 0;
			console.log('stopped');
		}
	}.bind(this);
	
	this.onTouchStart = function(e){
		e.preventDefault();
		e.stopPropagation();
		if(this.levelComplete || !this.inAir || this.steerDisabledTime > 0) return;
		this.moved = false;
		this.touchDownTime = this.time;
		this.touchDown = e;
		var touch;
		if(e.type == 'mousedown'){
			touch = e;
		} else {
			touch = e.originalEvent.targetTouches[0];	
		}
		
		this.touchDownLocation = [touch.clientX, touch.clientY];
	}.bind(this);

	this.onTouchMove = function(e){
		if(!this.touchDown || this.levelComplete) return;
		
		var touch;
		if(e.type == 'mousemove' || e.type == 'mousedown'){
			touch = e;
		} else {
			touch = e.originalEvent.targetTouches[0];	
		}
		var p = this.getPointOnFloor(touch.clientX, touch.clientY);
		if(this.inAir) { 
			if(!this.tunneling) {
				this.targetSledX = p.x * 0.7;
				this.targetSledZ = Math.min(this.maxSledZ, Math.max(this.minSledZ, p.z - 10));
			}
		}
		if(!this.moved){
			var shifted = Math.abs(touch.clientX - this.touchDownLocation[0]) + Math.abs(touch.clientY - this.touchDownLocation[1]);
			if(shifted >= 4){
				this.moved = true;
			}
		}
	}.bind(this);

	this.onTouchEnd = function(e){
		if(!this.touchDown) return;
		
		this.touchDown = false;
		// tap
		if(!this.moved){
			if(this.time - this.touchDownTime < 0.5 && this.time - this.lastTap > 0.4){
				this.lastTap = this.time; // prevent overtap
				this.tap(this.touchDownTime - this.time); // seconds ago
			}
		}
		this.targetSledZ = this.minSledZ + (this.maxSledZ - this.minSledZ) * 0.4;
	}.bind(this);
	
	this.getPointOnFloor = function(x, y){
		var screenPoint = new THREE.Vector3((x / (window.innerWidth) ) * 2 - 1, -(y / (window.innerHeight) ) * 2 + 1, 1.0);
		screenPoint.unproject(this.camera); //this.projector.unprojectVector(screenPoint, this.camera );
		this.raycaster.set(this.camera.position, screenPoint.sub(this.camera.position).normalize());

		// mouse coord on floor plane
		this.floorPlane.constant = this.scene.sled.position.y;
		return this.raycaster.ray.intersectPlane(this.floorPlane, null);
	};

/* launch present */

	this.tap = function(secondsAgo){
		if(this.tunneling) return;

		// scan objects forward
		var cont = this.scene.container.children;
		var numChildren = cont.length;
		var minX = this.targetSledX - this.gridSize;
		var maxX = this.targetSledX + this.gridSize;
		var minZ = this.targetSledZ + this.distance + this.gridSize;
		var maxZ = minZ + this.screenGridHeight * this.gridSize * 0.8;
		for(var i = 0; i < numChildren; i++){
			var obj = cont[i];
			if(obj.def && obj.def.house && !obj.tapped && obj.position.x >= minX && obj.position.x <= maxX && obj.position.z >= minZ && obj.position.z <= maxZ){
				obj.tapped = true;
				obj.addColor.set(0x11802b);
				obj.tween({target:obj.addColor, to: new THREE.Color(0x0), duration: 0.5 });
				
				// launch present
				this.launchPresent(obj);
				return;
			}
		}
		
		// failed to find target, launch in air
		this.launchPresent(null);
	};

	this.launchPresent = function(target){
		ios.playSound('toss'+(1 + Math.round(3 * Math.random())), 0.6);
		
		var present = this.getObjectFromPool("present");
		if(!present){
			present = new THREE.PixelBox(assets.cache.get("present"));
		} 
		
		present.position.set(this.scene.sled.position.x, this.scene.sled.position.y + 2, this.scene.sled.position.z + this.distance);
		present.originalPosition = present.position.clone();
		present.pointSize = 0.25;
		present.scale.set(0.2, 0.2, 0.2);
		present.time = 0;
		present.target = target;
		present.gotoAndStop('gift',Math.random());
		if(target){
			present.destinationDelta = target.anchors['chimney'].position.clone();
			target.localToWorld(present.destinationDelta);
			this.scene.container.worldToLocal(present.destinationDelta);
			present.destinationDelta.sub(present.position);
			
			// update sled
			if(this.numDelivered + 1 >= this.numTotal * 0.33){
				if(this.numDelivered + 1 >= this.numTotal * 0.66){
					if(this.scene.sled.currentAnimation.name != 'low'){
						this.scene.sled.gotoAndStop('low', 0);
					}
				} else if(this.scene.sled.currentAnimation.name != 'half'){
					this.scene.sled.gotoAndStop('half', 0);
				}
			}			
		} else {
			var xx = 10 * Math.random() - 5;
			present.destinationDelta = new THREE.Vector3(xx, 2-this.scene.sled.position.y, 80 + Math.random() * 10);
		}
		present.deliveryTime = 0.25 * present.destinationDelta.z / this.travelSpeed;
		present.think = this.thinkPresent;
		this.scene.container.add(present);
	};
	
	this.thinkPresent = function(delta){
		this.time += delta;
		
		/* easing: t = current time, b = start value, c = change in value, d = duration */
		this.position.set(
			Math.linearTween(this.time, this.originalPosition.x, this.destinationDelta.x, this.deliveryTime),
			this.time < this.deliveryTime * 0.5 ? 
				Math.easeOutSine(this.time, this.originalPosition.y, 8, this.deliveryTime * 0.5) :
				Math.easeInSine(this.time - this.deliveryTime * 0.5, this.originalPosition.y + 8, this.destinationDelta.y - 8, this.deliveryTime * 0.5),
			Math.linearTween(this.time, this.originalPosition.z, this.destinationDelta.z, this.deliveryTime)
		);
		this.rotation.y += delta * this.destinationDelta.x;
		
		if(this.time >= this.deliveryTime){
			if(this.target){
				gameScene.score += 10;
				gameScene.numDelivered++;
				gameScene.textEffect(this.target,'+10');
				$('#num-delivered', gameScene.summary).text(gameScene.numDelivered);
				delete this.target;
				gameScene.scene.container.remove(this);
				gameScene.putObjectsToPool(this);
				ios.playSound('score'+(1 + Math.round(3 * Math.random())), 0.6);
			} else {
				gameScene.score -= 5;
				gameScene.numWasted++;
				gameScene.textEffect(this,'-5').addClass('negative');
				$('#num-wasted', gameScene.summary).text(gameScene.numWasted);
				this.think = null;
				this.playAnim('puff');
				this.scale.multiplyScalar(4.0);
				this.addEventListener('anim-finish', gameScene.removeAndReturnToPool);
				ios.playSound('miss'+(1 + Math.round(3 * Math.random())), 0.6);
			}
			delete this.originalPosition;
			delete this.destinationDelta;
		}
	};
	
	this.removeAndReturnToPool = function(e){
		gameScene.scene.container.remove(this);
		gameScene.putObjectsToPool(this);
		this.removeEventListener('anim-finish', gameScene.removeAndReturnToPool);
	};
	
	this.textEffect = function(obj, text){
		var p = new THREE.Vector3(0,obj.geometry.data.height * 0.5,0);
		obj.localToWorld(p);
		p = this.getScreenCoord(p);
		
		var popup = $('<div class="popup-score"/>').text(text).offset({left:p.x, top:p.y});
		this.hud.append(popup);
		popup.addClass('popupFade');
		setTimeout(function(){ popup.hide().remove(); },900);
		
		return popup;
	};

/* collision */

	this.checkCollisions = function(){
		var sledBox = new THREE.Box3();
		sledBox.min.set(-8,-8,-16);
		sledBox.max.set(8,8,16);
		sledBox.expandByPoint(this.scene.sled.anchors['deer9'].position);
		sledBox.min.multiplyScalar(this.scene.sled.scale.x);
		sledBox.max.multiplyScalar(this.scene.sled.scale.x);
		sledBox.translate(this.scene.sled.position);
		for(var i = 0; i < this.colliders.length; i++){
			var coll = this.colliders[i];
			var collBox = new THREE.Box3();
			collBox.min.set(-coll.def.collide[0] * 0.5,-20,-coll.def.collide[1] * 0.5);
			collBox.max.set(coll.def.collide[0] * 0.5, 50, coll.def.collide[1] * 0.5);
			collBox.translate(this.scene.container.position).translate(coll.position);
			if(collBox.isIntersectionBox(sledBox)){
				// collision
				collBox.intersect(sledBox);
				this.collision(coll, collBox);
			}
		}
	};

	this.collision = function(collider, collBox){
		// special cases
		if(collider.def.tunnel){
			var speedBoost = 25.0 / this.travelSpeed;
		
			// exit from tunnel
			if(this.tunneling && collider.def.exit){
				this.tunneling = false;
				if(this.touchDown) this.onTouchEnd(this.touchDown);
				
				this.targetSledRotationX = this.scene.sled.rotation.x = -0.7;
				this.targetSledY = 18;
				this.scene.sled.position.x = this.targetSledX = collider.position.x;
				this.scene.sled.position.y = -40;
				this.steerDisabledTime = 1.0;
				setTimeout(function(){ gameScene.targetSledRotationX = 0; ios.loopSound('sleigh', 0.1); }, 1500 * speedBoost);

				ios.playSound('tunnel-enter', 0.25, 0.5);
			
			// enter
			} else if(!this.tunneling && !collider.def.exit) {
				if(this.touchDown) this.onTouchEnd(this.touchDown);
				this.tunneling = true;
				
				this.targetSledRotationX = 0.5;
				this.targetSledY = 1;
				this.targetSledX = collider.position.x;
				setTimeout(function(){ gameScene.targetSledY = -10; ios.loopSound('sleigh', 0.02); }, 1100 * speedBoost);
				
				ios.playSound('tunnel-enter', 0.25, 0.5);
			}
			
		// regular collision
		} else if(!this.tunneling){
			
			if(this.wordBubble) this.wordBubble.detach();
			
			this.levelComplete = true;
			this.crashed = true;
			
			// moves obj to container
			function transplantToContainer(obj){
				var par = obj.parent;
				par.localToWorld(obj.position);
				this.scene.container.worldToLocal(obj.position);			
				var chain = par;
				while(chain){
					obj.scale.multiplyScalar(chain.scale.x);
					chain = chain.parent;
				}
				obj.rotation.x += par.rotation.x;
				obj.rotation.y += par.rotation.y;
				obj.rotation.z += par.rotation.z;
				if(obj.name) {
					if(obj.anchored) delete par.parent[obj.name];
					delete par[obj.name];
				}
				par.remove(obj);
				
				this.scene.container.add(obj);
				
				return obj;
			}
			
			// explosion light
			this.scene.sled.spotLight.intensity = 0;
			var light = transplantToContainer.call(this, this.scene.sled.pointLight);
			collBox.center(light.position);
			light.position.add(collBox.center().clone().sub(collider.position).normalize());
			this.scene.container.worldToLocal(light.position);
			light.intensity = 10;
			light.distance = 50;
			light.color.set(0xFFFF66);
			this.scene.sled.tween({target:light.color, to:new THREE.Color(0xFF6633), duration: 0.5});
			this.scene.sled.tween({target:light, prop:"distance", to:5, duration: 0.5});
			this.scene.sled.tween({target:light, prop:"intensity", to: 1.0, duration: 1.0, ease:Math.easeOutSine,
									done:function(){
										gameScene.scene.container.remove(light);
										gameScene.putObjectsToPool(light);	
									}});
									
			// santa parachute
			var santa = transplantToContainer.call(this, this.scene.sled.santa);
			santa.destinationDelta = new THREE.Vector3(santa.position.x - light.position.x + (Math.random() * 40 - 20), 
												-santa.position.y - 3,
												this.travelSpeed * 2.5 + santa.position.z - (light.position.z + Math.random() * 40 - 20));
			santa.rotation.y = Math.atan2(santa.destinationDelta.x, santa.destinationDelta.z);
			santa.originalPosition = santa.position.clone();
			santa.time = 0;
			santa.gotoAndStop('fly', 0);
			santa.deliveryTime = 3.5;
			santa.think = this.santaFall;
			
			
			// explosions
			var p0 = collBox.center();
			var p1 = this.scene.sled.position;
			var p = p0.clone();
			
			for(var i = 0; i < 1; i+=0.2){
				p.x = p0.x + (p1.x - p0.x) * i;
				p.y = p0.y + (p1.y - p0.y) * i;
				p.z = p0.z + (p1.z - p0.z) * i;
				var ex = this.populateObject(this.scene.container, [ this.sceneAsset.templates['explosion'] ])[0];
				this.scene.container.worldToLocal(p);
				ex.position.add(p);
				
				ex.scale.multiplyScalar(1 + Math.random() * 0.5);
				ex.pointSize = ex.scale.x + 0.1;
				ex.addEventListener('anim-finish', gameScene.removeAndReturnToPool);
				ex.animSpeed = 0.5 + Math.random() * 0.5;
				ex.playAnim('explode');
			}
			setTimeout(function(){gameScene.scene.sled.visible = false;}, 100);
			
			// deer
			for(var i = 0; i < 9; i++){
				var deer = this.scene.sled['deer'+(i+1)];
				transplantToContainer.call(this, deer);
				deer.loopAnim('run');
				deer.rotation.y = Math.atan2(deer.position.x - light.position.x, deer.position.z - light.position.z);
				// add fire
				this.populateObject(deer, [ this.sceneAsset.templates['fire'] ]);
				deer.addColor.set(0xfff265).lerp(new THREE.Color(0x0), 0.9);
				deer.think = this.deerLooseThink;
				if(i == 8){
					var dl = deer.noseLight;
					dl.distance = 4;
					dl.intensity *= 0.5;
					dl.position.z += 2;
					santa.add(dl);
				}
			}
			
			ios.loopSound('', 0);
			
			ios.playSound('boom'+(1 + Math.round(3 * Math.random())), 0.6);
			
			this.showCrashMessage();
			this.gameOver(3.0);
		}
	};

	this.santaFall = function(delta){
		this.time += delta;
		
		/* easing: t = current time, b = start value, c = change in value, d = duration */
		this.position.set(
			Math.linearTween(this.time, this.originalPosition.x, this.destinationDelta.x, this.deliveryTime),
			this.time < this.deliveryTime * 0.5 ? 
				Math.easeOutSine(this.time, this.originalPosition.y, 15, this.deliveryTime * 0.5) :
				Math.easeInSine(this.time - this.deliveryTime * 0.5, this.originalPosition.y + 15, this.destinationDelta.y - 8, this.deliveryTime * 0.5),
			Math.linearTween(this.time, this.originalPosition.z, this.destinationDelta.z, this.deliveryTime)
		);
		
		if(this.time >= this.deliveryTime * 0.5 && this.currentAnimation.name == 'fly'){
			this.gotoAndStop('fall',0);
		}
		
		if(this.time >= this.deliveryTime){
			this.gotoAndStop('sit',0);
			delete this.originalPosition;
			delete this.destinationDelta;
			this.think = null;
			ios.playSound('miss1', 0.7);
		}
	};

	this.deerLooseThink = function(dt){
		var nth = parseInt(this.name.substr(-1));
		var rr = Math.seededRandom(nth * 10);
		this.rotateY((rr - 0.5) * 0.05);
		rr = Math.seededRandom(nth * 10) * 4;
		this.translateY(dt * rr);
		this.translateZ(dt * gameScene.travelSpeed * 0.35);
	};

/* scene think */

	this.tick = function(delta){
		delta = Math.min(0.1, delta);
		Scene.prototype.tick.call(this, delta);// super.tick
		
		this.thinkRecursive(this.scene.container, delta);
		
		// take off
		if(!this.inAir){
		
			// after 3 sec
			if(this.time >= this.warmUpDuration * 0.5){
				this.travelSpeed = 1.0;
				if(!this.inMotion) {
					this.inMotion = true;
					for(var i = 0; i < 9; i++){
						var deer = this.scene.sled['deer'+(i+1)];
						deer.gotoAndStop('run', i % 4);
						deer.loopAnim('run', Infinity, true);
						deer._animSpeed = 0.2;
					}
				}
				this.distance += delta * this.travelSpeed;
				// takeoff
				if(this.distance < this.takeOffDuration){
					//t = current time, b = start value, c = change in value, d = duration
					this.scene.sled.position.y = Math.easeInOutSine(this.distance, 2, 14, this.takeOffDuration);
					this.cameraPosition.y = Math.easeInOutSine(this.distance, this.targetCameraY, 35, this.takeOffDuration);
					this.cameraTarget.z = Math.easeInOutSine(this.distance, 0, 15, this.takeOffDuration);
				// takeoff complete
				} else {
					console.log("Takeoff complete");
					if(renderer.currentScene == this) ios.loopSound('sleigh', 0.1);
					this.targetCameraY += 35;
					this.targetTravelSpeed = 25;
					this.targetSledY = 18;
					this.targetSledZ = this.minSledZ + (this.maxSledZ - this.minSledZ) * 0.4;
					this.inAir = true;
				}
			}
		
		// in air
		} else {
			this.distance += delta * this.travelSpeed;
			
			var deltaSpeedBoost = this.travelSpeed / 25.0;
			
			var dx = (this.targetSledX - this.scene.sled.position.x);
			this.scene.sled.position.x = this.scene.sled.position.x + dx * delta * Math.min(5, 4 * deltaSpeedBoost);
			this.scene.sled.position.z = this.scene.sled.position.z + (this.targetSledZ - this.scene.sled.position.z) * delta * 2;
			this.scene.sled.position.y = this.scene.sled.position.y + ((this.targetSledY + Math.sin(this.time * 2)) - this.scene.sled.position.y) * delta * deltaSpeedBoost;
			
			this.scene.sled.rotation.x = this.scene.sled.rotation.x + (this.targetSledRotationX - this.scene.sled.rotation.x) * delta * 4 * deltaSpeedBoost;
			this.scene.sled.rotation.y = Math.min(0.3, Math.max(-0.3, dx * 0.01));
			
			if(this.steerDisabledTime > 0){
				this.steerDisabledTime = Math.max(0, this.steerDisabledTime - delta);
			}
			
			// adjust cam
			if(this.cameraPosition.y != this.targetCameraY){
				this.cameraPosition.y = this.cameraPosition.y + Math.round(this.cameraPosition.y - this.cameraPosition.y) * 0.5;
			}
			// accelerate
			var ss = (THREE.Math.smoothstep(this.scene.sled.position.z, this.minSledZ, this.maxSledZ) - 0.5) * 2;
			var extraSpeed = ss * (ss < 0 ? 0.2 : 1) * this.targetTravelSpeed;
			var tt = Math.round(this.targetTravelSpeed + extraSpeed);
			if(this.travelSpeed != tt){
				this.travelSpeed = this.travelSpeed + (tt - this.travelSpeed) * delta * 2.0;
				if(Math.abs(this.travelSpeed - tt) <= 1.0) this.travelSpeed = tt;
			}
		}
		
		// crash
		if(this.crashed){
			
		} else {
			// advance container
			if(this.levelComplete){
				this.scene.sled.position.z = (this.scene.container.position.z + this.distance) - 16.0;
				
			// regular travel
			} else {
				this.scene.container.position.z = -this.distance;
				this.distanceTraveled = this.distance * 0.1;
				
				if(this.wordBubble){
					this.wordBubble.css({ left: Math.floor(50 - this.scene.sled.position.x * 1.9) + '%', top: Math.floor(15 - this.scene.sled.position.z * 1.5) + '%' });
					this.wordSubBubble.css({ left: (-this.scene.sled.position.x * 0.2 - 0.5)+'em'});
				}
			}
		}
		// update landscape and deer
		var gridPosition = Math.floor(this.distance / this.gridSize);
		if(gridPosition != this.prevGridPosition){
			this.updateContainerContents(gridPosition);
			this.prevGridPosition = gridPosition;
			if(!this.crashed){
				for(var i = 0; i < 9; i++){
					this.scene.sled['deer'+(i+1)]._animSpeed = 0.2 + this.travelSpeed / 15.0;
				}
				if(!this.levelComplete){
					this.averageSpeed += this.travelSpeed;
					if(this.colliders.length) this.checkCollisions();
				}
			}
			if(this.levelComplete && !this.crashed && renderer.currentScene == this){
				var vol = Math.max(0, 0.1 * (1.0 - (this.scene.sled.position.z + 16) / 100));
				if(vol){
					ios.loopSound('sleigh', vol);
				} else {
					ios.loopSound('', 0);
				}
			}
		} else {
			// check coll if actively steering
			if(Math.abs(this.targetSledX - this.scene.sled.position.x) > 5 && !this.levelComplete && !this.crashed && this.colliders.length) this.checkCollisions();
		}		
		
		// update snow
		this.snow.updateFrameWithCallback(this.updateSnow, {delta: delta, travelSpeed: this.levelComplete ? 0 : this.travelSpeed });
		
		// continue simulate move if long tap
		if(this.touchDown && !this.moved && (this.time - this.touchDownTime >= 0.3)){
			this.onTouchMove(this.touchDown);
		}
		
		// camera wobble
		if(this.cameraPosition && !DEBUG_CAMERA){
			this.camera.position.copy(this.cameraPosition);
			var r = this.camRightVector.clone().multiplyScalar(ios.orientation.x);
			this.camera.position.add(r);
			r = this.camUpVector.clone().multiplyScalar(ios.orientation.y);
			this.camera.position.add(r);
			r = this.camRightVector.clone().multiplyScalar(-ios.orientation.x * 0.25).add(this.cameraTarget);
			this.camera.lookAt(r);
			this.camera.rotation.z += -0.01 * ios.orientation.z;
		}
	};
	
	this.updateContainerContents = function(pos){
		var cont = this.scene.container.children;
		var obj;
		var numRemoved = 0;
		var maxPos = 0;
		this.colliders.length = 0;
		
		if(this.levelComplete) return;
		
		for(var i = 0; i < cont.length; i++){
			obj = cont[i];
			if(obj.pos === undefined) continue;
			
			// detect missed houses
			if(obj.pos <= pos && obj.def && obj.def.house && !obj.tapped){
				console.log("Missed!");
				obj.addColor.set(0x742828);
				obj.tween({target:obj.addColor, to: new THREE.Color(0x0), duration: 0.25 });
				this.textEffect(obj, '-10').addClass('negative');
				this.numMissed++;
				this.score -= 10;
				$('#num-missed', this.summary).text(this.numMissed);
				ios.playSound('pass'+(1 + Math.round(3 * Math.random())), 0.6);
				obj.tapped = true;
			}				

			if(obj.pos < pos - 4){
				numRemoved++;
				i--;
				//
				var rem = obj.recursiveRemoveChildren();
				this.scene.container.remove(obj);
				this.putObjectsToPool(rem.concat(obj));
			} else {
				maxPos = Math.max(maxPos, obj.pos);
				if(obj.def.collide) {
					this.colliders.push(obj);
				}
			}
		}
		
		maxPos = Math.max(pos, maxPos);
		
		// add maxPos + 1 -> pos + screenGridHeight
		for(var gz = maxPos + 1; gz < pos + this.screenGridHeight; gz++){
			// five per row
			for(var gx = 0; gx < 5; gx++){
				var addr = gz * 5 + gx;
				// check bounds
				if(addr > this.sceneAsset.level.length){
					this.levelComplete = true;
					this.touchDown = null;
					console.log("Level complete");
					this.gameOver();
					return;
				}
				// add object(s)
				var objDef = this.sceneAsset.level[this.sceneAsset.level.length - addr - 1];
				if(objDef) { 
					if(!_.isArray(objDef)){
						objDef = [objDef];
					}
					for(var i in objDef){
						var obj = this.addObjectToContainer(objDef[i], gx, gz);
					}
				}
			}		
		}		
	};
	
	this.addObjectToContainer = function(objDef, gx, gz){
		// template
		if(typeof(objDef) == 'string'){
			objDef = this.sceneAsset.templates[objDef];
		}
		// asset
		if(objDef.asset){
			var objs = this.populateObject(this.scene.container, [ objDef ]);
			for(var i in objs){
				var obj = objs[i];
				if(i == 0){
					var yoffs = 0;
					if(obj instanceof THREE.PointCloud){
						yoffs = obj.geometry.data.height * obj.scale.y * 0.5;
					}
					obj.position.add(new THREE.Vector3((gx - 2) * this.gridSize, yoffs, gz * this.gridSize));
					obj.pos = gz;
					obj.tapped = false;
				}
				if(obj.def['move']){
					var p = new THREE.Vector3(obj.def.move[0],obj.def.move[1],obj.def.move[2]);
					p.add(obj.position);
					obj.tween({target:obj.position, to:p, duration: obj.def.move[3]});
				}
				if(obj.def['rotate']){
					var degToRad = Math.PI / 180.0;
					var r = new THREE.Euler(obj.def.rotate[0] * degToRad,obj.def.rotate[1] * degToRad,obj.def.rotate[2] * degToRad,'XYZ');
					r.x += obj.rotation.x; r.y += obj.rotation.y; r.z += obj.rotation.z;
					obj.tween({target:obj.rotation, to:r, duration: obj.def.rotate[3]});
				}
				if(obj instanceof THREE.Light){
					THREE.PixelBox.updateLights(this.scene);
					console.log("update lights!");
				}
			}
		// info object
		} else {
			if(objDef.sled != undefined){
				this.scene.sled.gotoAndStop(objDef.sled, 0);
			}
			if(objDef.speed != undefined){
				this.targetTravelSpeed = objDef.speed;
			}
			if(objDef.say != undefined && !this.crashed){
				this.showSayMessage(objDef.say);
			}			
		}
		if(objDef['playSound']){
			var speedBoost = 25.0 / this.travelSpeed;
			ios.playSound(objDef.playSound, objDef.volume, (objDef.delay != undefined ? (objDef.delay * speedBoost) : 0));
		}
		return obj;
	};
	
	this.showSayMessage = function(msg){
		if($('#word-bubble').length) return;
		$('#hohoho,#word-bubble').remove();
		this.wordBubble = $('<div id="word-bubble" class="fadeIn"><div class="say"/><div class="sub-bubble">&nbsp;</div></div>');
		this.wordSubBubble = $('div.sub-bubble',this.wordBubble);
		$('div.say',this.wordBubble).html(msg.replace("\\n","<br/>"));
		$('body').append(this.wordBubble);
		ios.playSound('say', 1.0, 0.25);
		this.wordBubble.css({left:"-100%"}).hide().fadeIn(150);
		setTimeout(function(){ gameScene.wordBubble.fadeOut(500, function(){ gameScene.wordBubble.remove(); gameScene.wordSubBubble = gameScene.wordBubble = null; }); }, 2500);
	};
	
	this.showWarmUpMessage = function(){
		$('body').append('<div id="hohoho"><span class="ho1">HO!</span></div>');
		$('#hohoho').fadeIn(250);
		ios.playSound('hohoho', 0.5, 0);
		var duration = 400;
		setTimeout(function(){
			$('#hohoho').append('<span class="ho2">HO!</span>').fadeIn();
			setTimeout(function(){
				$('#hohoho').append('<span class="ho3">HO!</span>').fadeIn();
				setTimeout(function(){
					$('#hohoho').remove();
				}, duration + 500);
			}, duration);
		}, duration + 250);

		this.warmUpMessageDisplayed = true;
	};

	this.showCrashMessage = function(){
		console.log("oh oh oh");
		if(renderer.currentScene != this) return;
		$('body').append('<div id="hohoho"><span class="ho1 negative">oh!</span></div>');
		$('#hohoho').fadeIn(250);
		ios.playSound('ohohoh', 0.5, 0.2);
		var duration = 400;
		setTimeout(function(){
			$('#hohoho').append('<span class="ho2 negative">oh!</span>').fadeIn(250);
			setTimeout(function(){
				$('#hohoho').append('<span class="ho3 negative">oh!</span>').fadeIn(250);
				setTimeout(function(){
					$('#hohoho').remove();
				}, duration + 500);
			}, duration);
		}, duration + 250);
	};

	
	this.updateSnow = function(pobj, info){
		var p = pobj.p;
		var dt = info.delta;
		
		// fall
		p.y -= dt * (4 * Math.seededRandom(pobj.i));
		
		p.x += dt * 4 * (Math.seededRandom(p.y * 0.1) - 0.5);
		p.z -= dt * info.travelSpeed;
		
		if(p.z < -40) p.z = 110 + p.z;
		
		if(p.y <= 0){
			p.set(50 * Math.random() - 25, 30, 110 * Math.random() - 40);
		}		
	};
	
	
/* scene callbacks */
	
	this.onAdded = function(){
		Scene.prototype.onAdded.call(this);
		this.enableTouchEvents(true);
		this.showWarmUpMessage();
		$('body').removeClass('loading');
	};
	
	this.onWillRemove = function(){
		this.enableTouchEvents(false);
		Scene.prototype.onWillRemove.call(this);
		
		ios.loopSound('', 0);

		this.menu.detach();
		this.hud.detach();
		this.summary.detach();
	};

	this.onRemoved = function(){
		Scene.prototype.onRemoved.call(this);
		this.summary.detach();

		// clean up
		this.putObjectsToPool(this.scene.container.recursiveRemoveChildren());
		for(var i = 0; i < 9; i++){
			var deer = this.scene.sled['deer'+(i+1)];
			if(!deer) break;
			deer.stopAnim();
		}
		
		if(!this.quit) ios.call({showAd:true});
	};
	
/* scoring */

	Object.defineProperty(this, 'score', {
		get: function(){ return this._score; },
		set: function(v){ 
			if(v != this._score){
				// todo - anim
				this._score = v;
			}
			$('#score').text(('000'+Math.abs(this._score)).substr(-4)).removeClass('negative');
			if(this._score < 0) $('#score').addClass('negative');
		},
	});
	
	this.gameOver = function(delay){
		if(renderer.currentScene != this) return;

		this.hud.hide();
		$('body').append(this.summary);
	
		if(delay === undefined) delay = 0.01;
		this.summary.hide();
		
		// verdict
		if(this.numDelivered == 0){
			$('#delivered').text('none');
			$('#game-over h2').text('Failure');
			this.finalSound = 'fail';
		} else if(this.numDelivered == this.numTotal){
			$('#delivered').text('ALL');
			$('#game-over h2').text('Awesome');
			this.finalSound = null;
			ios.playSound('awesome', 0.5, 0.5);
			if(!this.crashed){
				this.snow.pointSize *= 2.0;
				this.snow.updateFrameWithCallback(function(pobj){
					pobj.c.setHSL(Math.random(), 0.7 + 0.3 * Math.random(), 0.5 + 0.25 * Math.random());
					pobj.b = 0.9;
				});
			}		
		} else if(this.numDelivered < this.numTotal * 0.5){
			$('#delivered').text('some');
			$('#game-over h2').text('Not Bad');
			this.finalSound = 'notbad';
		} else {
			$('#delivered').text('most');
			$('#game-over h2').text('Great');
			this.finalSound = 'great';
		}
		
		$('#game-over p').removeClass('pulse');
		$('#new-best').hide();

		this.averageSpeed = (this.averageSpeed / this.distanceTraveled) / 45;
		this.finalScore = this.numDelivered * 10 - this.numWasted * 5 - this.numMissed * 10 + (this.numWasted ? 0 : this.numDelivered) + Math.ceil(this.distanceTraveled * 0.5 * this.averageSpeed);
		
		// numbers
		$('#num-missed').text(this.numMissed);
		if(this.numMissed) $('#num-missed').addClass('negative'); else $('#num-missed').removeClass('negative');
		$('#num-delivered').text(this.numDelivered);
		if(this.numDelivered) $('#num-delivered').removeClass('negative'); else $('#num-missed').addClass('negative');
		$('#num-wasted').text(this.numWasted);
		if(this.numWasted) $('#num-wasted').addClass('negative'); else $('#num-wasted').removeClass('negative');
		$('#num-distance').html(Math.ceil(this.distanceTraveled)+'<sub> km</sub>');
		$('#num-haste').html('<sub>x</sub>' + this.averageSpeed.toFixed(1));
		this.score = 0;
		$('#final-score').text($('#score').text()).removeClass('negative');

		gameScene.nextTimeout = setTimeout(function(){
			var add = gameScene.numDelivered * 10;
			$('#num-delivered').parent().addClass('pulse');
			$('#num-delivered').append('<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
			ios.playSound('chirp1', 0.25);
			gameScene.setGameOverScore(gameScene.score + add);
			gameScene.nextTimeout = setTimeout(function(){
				var add = -gameScene.numMissed * 10;
				$('#num-missed').parent().addClass('pulse');
				$('#num-missed').append('<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
				ios.playSound('chirp2', 0.25);
				gameScene.setGameOverScore(gameScene.score + add);
				gameScene.nextTimeout = setTimeout(function(){
					var add = -gameScene.numWasted * 5;
					if(!add) add = gameScene.numDelivered;
					$('#num-wasted').parent().addClass('pulse');
					$('#num-wasted').append('<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
					ios.playSound('chirp3', 0.25);
					gameScene.setGameOverScore(gameScene.score + add);
					gameScene.nextTimeout = setTimeout(gameScene.showFinalScore, 1000);
				}, 1000);
			}, 1000);
		}, delay * 1000 + 1000);		

		// show gameover
		setTimeout(function(){
			$('#game-over').show().addClass('slideDown');
		}, delay * 1000);
	},
	
	
	this.showFinalScore = function(skipAnim){
		if(gameScene.nextTimeout) clearTimeout(gameScene.nextTimeout);
		gameScene.nextTimeout = 0;
		if(!skipAnim){
			var add = Math.ceil(gameScene.distanceTraveled * 0.5 * gameScene.averageSpeed);
			$('#num-distance,#num-haste').parent().addClass('pulse');
			$('#num-haste').append('<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');		
			ios.playSound('chirp4', 0.25);
			if(gameScene.finalSound) ios.playSound(gameScene.finalSound, 0.5, 0.5);
		} else {
			var add = gameScene.numDelivered * 10;
			$('#num-delivered').html(gameScene.numDelivered + '<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
			add = -gameScene.numWasted * 5;
			if(!add) add = gameScene.numDelivered;
			$('#num-wasted').html(gameScene.numWasted + '<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
			add = -gameScene.numMissed * 10;
			$('#num-missed').html(gameScene.numMissed + '<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
			add = Math.ceil(gameScene.distanceTraveled * 0.5 * gameScene.averageSpeed);
			$('#num-haste').html('<sub>x</sub>' + gameScene.averageSpeed.toFixed(1) + '<em>'+(add >= 0 ? ('+'+add) : add)+'</em>');
		}
		gameScene.setGameOverScore(gameScene.finalScore);
		
		// high score
		ios.call({setPref:'lastScore', value:gameScene.score});
		if(gameScene.score > 0 && (menuScene.bestScore == undefined || gameScene.score > menuScene.bestScore)){
			ios.call({setPref:'bestScore', value:gameScene.score});
			if(!skipAnim) $('#new-best').show().fadeIn(500);
			menuScene.bestScore = 0;
		}				
	};
	
	this.setGameOverScore = function(newScore){
		this.score = newScore;
		if(this.score >= 0) $('#final-score').removeClass('negative'); else $('#final-score').addClass('negative');
		$('#final-score').text($('#score').text()).removeClass('pulse').addClass('pulse');
	};
	
	
/* populate scene */

	this.onWillAdd = function(){
		Scene.prototype.onWillAdd.call(this);
		$('.loading').detach();
		
		ios.playSound('harp', 0.5, 1.0);
		
		// show menu
		this.showHUD();

		// add scene stuff
		this.sceneAsset = assets.cache.get('gameScene');
		this.populateWith(this.sceneAsset);
	
		// store camera position for wobble effect
		this.camera.updateMatrixWorld(true);
		this.cameraPosition = this.camera.position.clone();
		this.cameraTarget = new THREE.Vector3();
		this.camUpVector = new THREE.Vector3(0,1,0);
		this.camRightVector = new THREE.Vector3(1,0,0);
		var normalMatrix = new THREE.Matrix3().getNormalMatrix( this.camera.matrixWorld );
		this.camUpVector.applyMatrix3(normalMatrix).normalize();
		this.camRightVector.applyMatrix3(normalMatrix).normalize();
	
		// snow
		this.snowTime = 0;
		if(!this.snow){
			this.snow = new THREE.PixelBox({ offset: false, frames: null, width:10, depth:10, height:(window['olderDevice'] ? 2 : 5), pointSize: 0.3});
			this.snow.addFrameAt(0);
			this.snow.frame = 0;
			this.snow.castShadow = false;
			this.snow.receiveShadow = false;
			this.snow.occlusion = 0;
			this.scene.add(this.snow);
		}
		this.snow.pointSize = 0.3;
		this.snow.updateFrameWithCallback(function(pobj){
			pobj.p.set(50 * Math.random() - 25, 30 * Math.random(), 110 * Math.random() - 40);
			pobj.c.set(0xFFffff);
			pobj.o = -0.5;
			pobj.b = 0;
		});	
		
		// debug
		if(DEBUG_CAMERA){
			this.controls = new THREE.EditorControls(this.camera, $('body')[0]);
			this.controls.rotateEnabled = this.controls.zoomEnabled = this.controls.panEnabled = true;
			var helper = new THREE.CameraHelper(this.camera.clone());
			this.scene.add(helper);
		}
		
		// game time
		this.time = 0;
		this.distance = 0; // actual distance traveled
		this.travelSpeed = 0; // actual speed
		
		this.inAir = false; // take off complete
		this.inMotion = false; // motion started
		this.levelComplete = false; // traveled as far as sceneAsset.level allows
		this.takeOffDuration = 2.0; // how long before can control sled
		this.warmUpDuration = 3.0; // how long hohoho is displayed
		
		this.targetSledX = 0;
		this.targetSledY = 2;
		this.targetSledZ = -16;
		this.targetSledRotationX = 0;
		this.targetTravelSpeed = 1.0;
		this.maxSledZ = -5;
		this.minSledZ = -25;
		this.targetCameraY = this.camera.position.y;
		this.steerDisabledTime = 0;
		
		// grid
		this.gridSize = 8;
		this.screenGridHeight = 13;
		this.prevGridPosition = -1;
		
		// controls
		this.moved = false;
		this.touchDown = null;
		this.touchDownTime = Infinity;
		this.lastTap = 0;
		
		// scoring
		this.score = 0;
		this.numMissed = 0;
		this.numDelivered = 0;
		this.numTotal = 0;
		this.numWasted = 0;
		this.distanceTraveled = 0;
		this.averageSpeed = 0;
		this.crashed = false;
		this.quit = false; // quit mid game
		
		// colliding objects
		this.colliders = [];
		this.tunneling = false;

		// count total houses
		for(var i = 0; i < this.sceneAsset.level.length; i++){
			var objs = this.sceneAsset.level[i];
			if(!objs) continue;
			if(!_.isArray(objs)){ objs = [ objs ]; }
			for(var oi = 0; oi < objs.length; oi++){
				obj = objs[oi];
				if(typeof(obj) == 'string'){
					if(!this.sceneAsset.templates[obj]) { console.log("template "+obj+" not found"); continue; }
					else obj = this.sceneAsset.templates[obj];
				}
				if(obj.house) this.numTotal++;
			}
		}
		
		THREE.PixelBox.updateLights(this.scene);
	};
}

/* extends Scene */
GameScene.prototype = Object.create(Scene.prototype);
GameScene.prototype.constructor = GameScene;
