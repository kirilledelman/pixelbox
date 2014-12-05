/*

*/

function MenuScene(){
	console.log("MenuScene");

	Scene.call(this); // parent constructor
	
/* menu */

	this.showMenu = function(){
		if(!this.menu){
			this.menu = 
			$('<div id="main-menu" class="menu current slideExpandUp">\
			<h2>Santa Drop</h2><h2 class="over">Santa Drop</h2>\
			<a id="new-game" class="fat">START</a>\
			<p id="last-score">Last Score <span class="score">0000</span></p>\
			<p id="best-score">Best Score <span class="score">0000</span></p>\
			</div>\
			<div id="bottom-menu" class="menu"><a id="music-toggle" class="toggle">&#9835;<div class="cross-over">&#x2715;</div></a></div>');
			
			var f = function(e){
				e.preventDefault();
				e.stopPropagation();
				ios.call({userInteraction: false});
				ios.playSound('start', 0.5);
	
				$('.menu').fadeOut(200, function(){ 
					$(this).detach(); 
				});
				
				$('#new-game').removeClass('colorpulse');
				
				if(!this.loading){
					this.loading = $('<div class="loading"><h2 class="center">Loading</h2></div>');
				}
				$('body').append(this.loading);				
				this.loading.fadeIn(200);
				
				setTimeout(function(){
					if(!window['gameScene']){
						window.gameScene = new GameScene();
					}
					renderer.setScene(window.gameScene, 1);
					ios.call({userInteraction: true});
				}, 250);	
			};
			$('#new-game', this.menu).on('touchstart click', f);
			
			// music
			f = function(e){
				e.stopPropagation();
				e.preventDefault();
				musicEnabled = !musicEnabled;
				if(musicEnabled) {
					$('#music-toggle').addClass('enabled');
					ios.call({loopSound:'music', volume: 0.5});
				} else {
					$('#music-toggle').removeClass('enabled');
					ios.call({loopSound:'', volume: 0});
				}
				ios.call({setPref:'music', value:(musicEnabled ? "true" : "false")});
			};		
			$('#music-toggle', this.menu).on('touchstart click', f);
			
			// hide loading
			$('.loading').fadeOut(200, function(){ $(this).remove(); });
		}
		this.menu.show();
		$('body').append(this.menu);
		$('#new-game').addClass('colorpulse');
		
		// get prefs
		musicEnabled = true;
		$('#best-score').removeClass('expandOpen');		
		ios.call({getPref:['music','shadows','lastScore', 'bestScore']}, function(ret){
			musicEnabled = (ret.music != 'false');
			renderer.webgl.shadowMapEnabled = (ret.shadows != 'false');
			if(musicEnabled) {
				$('#music-toggle').addClass('enabled');
				ios.call({loopSound:'music', volume: 0.5});
			}
			if(ret.lastScore !== null) {
				$('#last-score .score').text(('000'+Math.abs(ret.lastScore)).substr(-4));
				if(ret.lastScore < 0) $('#last-score .score').addClass('negative'); else $('#last-score .score').removeClass('negative');
			}
			if(ret.bestScore !== null) { 
				$('#best-score .score').text(('000'+Math.abs(ret.bestScore)).substr(-4));
				if(ret.bestScore > menuScene.bestScore){
					setTimeout(function(){
						$('#best-score').show().addClass('expandOpen');
					},1000);
					$('#best-score').hide();
				}
				menuScene.bestScore = ret.bestScore;
			}	
		});
	};
	
/* touch events */

	this.enableTouchEvents = function(enable){
		if(enable){
			$('body').on('touchstart.menu', this.onTouchStart.bind(this));
			$('body').on('touchmove.menu', this.onTouchMove.bind(this));
			$('body').on('touchend.menu', this.onTouchEnd.bind(this));
			$('body').on('touchcancel.menu', this.onTouchEnd.bind(this));
		} else {
			$('body').off('.menu');
		}
	};
	
	this.onTouchStart = function(e){
		e.preventDefault();
		e.stopPropagation();
	};

	this.onTouchMove = function(e){
	};

	this.onTouchEnd = function(e){
	};
	
	this.getPointOnFloor = function(x, y){
		var screenPoint = new THREE.Vector3((x / (window.innerWidth) ) * 2 - 1, -(y / (window.innerHeight) ) * 2 + 1, 1.0);
		this.projector.unprojectVector(screenPoint, this.camera );
		this.raycaster.set(this.camera.position, screenPoint.sub(this.camera.position).normalize());

		// mouse coord on floor plane
		return this.raycaster.ray.intersectPlane(this.floorPlane, null);
	};
	
/* scene think */

	this.tick = function(delta){
		Scene.prototype.tick.call(this, delta);// super.tick
		
		if(this.scene.firePlaceLight){
			var r = Math.seededRandom(this.time * 0.001);
			var r1 = Math.seededRandom(40 + this.time * 0.017);
			r = r % r1;
			this.scene.firePlaceLight.intensity = 6 - r * 0.5;
			this.scene.fireLight.intensity = 1.5 - r * 0.2;
			this.scene.fire1.rotation.y = this.time * 0.5;
			this.scene.fire2.rotation.y = -this.time * 0.4;
		}
		
		// camera wobble
		if(this.cameraPosition && !DEBUG_CAMERA){
			this.camera.position.copy(this.cameraPosition);
			//var r = this.camRightVector.clone().multiplyScalar(ios.orientation.z);
			//this.camera.position.add(r);
			r = this.camUpVector.clone().multiplyScalar(ios.orientation.y);
			this.camera.position.add(r);
			this.camera.lookAt(this.cameraTarget);
			this.camera.rotation.z += -0.025 * ios.orientation.x;
		}
	};
	
/* scene callbacks */
	
	this.onAdded = function(){
		Scene.prototype.onAdded.call(this);
		this.enableTouchEvents(true);

		// store camera position for wobble effect
		this.cameraPosition = this.camera.position.clone();
		this.cameraTarget = new THREE.Vector3();
		this.camUpVector = new THREE.Vector3(0,1,0);
		this.camRightVector = new THREE.Vector3(1,0,0);
		var normalMatrix = new THREE.Matrix3().getNormalMatrix( this.camera.matrixWorld );
		this.camUpVector.applyMatrix3(normalMatrix).normalize();
		this.camRightVector.applyMatrix3(normalMatrix).normalize();
		
		// show menu
		this.showMenu();

		ios.playSound('toss5', 0.3, 0.0);
		ios.playSound('clink', 0.3, 0.5);

		if(DEBUG_CAMERA){
			this.controls = new THREE.EditorControls(this.camera, $('body')[0]);
			this.controls.rotateEnabled = this.controls.zoomEnabled = this.controls.panEnabled = true;
			var helper = new THREE.CameraHelper(this.camera.clone());
			this.scene.add(helper);
		}

		ios.call({userInteraction: true});
	};
	
	this.onWillRemove = function(){
		this.enableTouchEvents(false);
		Scene.prototype.onWillRemove.call(this);

		// stop music
		ios.call({loopSound:'', volume: 0});
	};
	
	this.onRemoved = function(){
		Scene.prototype.onRemoved.call(this);
		
		// clean up
		this.putObjectsToPool(this.scene.recursiveRemoveChildren([this.camera]));
	};	
	
/* populate scene */

	this.onWillAdd = function(){
		Scene.prototype.onWillAdd.call(this);
		
		ios.call({userInteraction: false});

		$('canvas').css({left:0});
		setTimeout(function(){$('div.page-bg').remove();}, 250);
		this.populateWith(assets.cache.get('menuScene'));
		
		THREE.PixelBox.updateLights(this.scene);
	};
}

/* extends Scene */
MenuScene.prototype = Object.create(Scene.prototype);
MenuScene.prototype.constructor = MenuScene;
