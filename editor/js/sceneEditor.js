/*


	modify .serialize() so that Dir and Spotlights output .target correctly
	
	move populateObject to THREE.Scene
	
	screenshot move	
	
	

	Properties:
		Scene:
			MaxShadows - reserve shadows
			Clear color
			Fog values
			
	
*/

function EditSceneScene(){
	
	this.initUndo();
	
	this.shift = false;
	this.ctrl = false;
	this.alt = false;
	
	this.selectedObjects = [];
	
	this.mouseCoord = {x: 0, y: 0};
		
	this.canvasInteractionsEnabled = true;
	this.disableCanvasInteractionsOnRelease = false;
}

EditSceneScene.prototype = {

/* ------------------- ------------------- ------------------- ------------------- ------------------- Undo functions */

	/* undo queue */
	initUndo:function(){
		this._undoing = false;
		this._undo = [];
		this._redo = [];
		this.undoChanged();
	},
	
	/* joins last n undos into one action */
	joinUndoActions: function(n){
		var newItem = [];
		for(var i = this._undo.length - n; i < this._undo.length; i++){
			newItem.push(this._undo[i]);
		}
		this._undo.splice(this._undo.length - n, n);
		this._undo.push(newItem);
	},
	
	/* if previous-1 undo action can be merged with last one, merge them */
	mergeUndo:function(){
		var undo1 = this._undo[this._undo.length - 1];
		var undo2 = this._undo[this._undo.length - 2];
		if(undo1.mergeable && undo2.mergeable && undo1.name == undo2.name){
			// common
			undo2.redo = undo1.redo;
			
			// merge to undo2
			switch(undo1.name){
			case 'moveBy':
			case 'moveTo':
			case 'rotateBy':
			case 'rotateTo':
			case 'scaleBy':
			case 'scaleTo':
				// compare operands
				if(undo1.redo[1].length != undo2.redo[1].length) return;
				for(var i = 0; i < undo1.redo[1].length; i++){
					if(undo1.redo[1][i][0] != undo2.redo[1][i][0]) return;
				}
				break;
			// case 'sceneMaxShadows':
			}
			
			// remove undo1
			this._undo.pop(); 
		}
	},
	
	/* replaces references to object with another object,
		used after updating an asset in scene.
	*/		
	replaceReferencesInUndo:function(rep){
		var updateRecurse = function(arg){
			if(typeof(arg)!='object') return;
			for(var p in arg){
				var val = arg[p];
				if(typeof(val)!='object') continue;
				if(val && val instanceof THREE.Object3D){
					if(rep[val.uuid]){
						// found, replace
						arg[p] = rep[val.uuid];
					}
					continue;
				}
				updateRecurse(val);
			}
		}
		// process undo and redo
		for(var i = 0; i < this._undo.length; i++){
			updateRecurse(this._undo[i].undo);	
			updateRecurse(this._undo[i].redo);	
		}
		for(var i = 0; i < this._redo.length; i++){
			updateRecurse(this._redo[i].undo);	
			updateRecurse(this._redo[i].redo);	
		}
	},
	
	undoChanged:function(){
		if(this._undo.length > 1) this.mergeUndo();
		
		$('#undo').button({label:"Undo" + (this._undo.length ? (' ('+this._undo.length+')') : ''), disabled: !this._undo.length});
		$('#redo').button({label:"Redo" + (this._redo.length ? (' ('+this._redo.length+')') : ''), disabled: !this._redo.length});
		
		// update helpers
		if(this.container) {
			this.container.traverse(function(obj){ 
				if(obj.helper) {
					obj.updateMatrixWorld(true);
					obj.helper.update();
				}
			});
		}
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
			this.refreshProps();
		}
	},
	performRedo:function(){
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
			this.refreshProps();
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Mouse handling */
	
	mouseDown:function(e){
		this.lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
		this.mouseMoved = false;
		
		this.ctrl = e.ctrlKey;
		this.shift = e.shiftKey;
		this.alt = e.altKey;
		
		// ignore right button
		if(e.button === 2 || !this.canvasInteractionsEnabled || $(event.target).hasClass('object-label')) return;
		
		// blur input boxes
		if(e.target.nodeName.toLowerCase()=='canvas') editScene.blur();

		/*if(this._pasteMode && this.intersectingPaste && !this.ctrl){
			this.startPasteMove();
		} else if(this.canStroke) { 
			this.startStroke();
		} else if(this.movingMaskEnabled && this.intersectingMask){
			this.startMaskMove();
		}*/
	},

	mouseUp:function(e){
		/*
		if(this.stroking){
			this.finishStroke();
		} else if(this.movingMask){
			this.finishMaskMove();
		} else if(this.movingPaste){
			this.finishPasteMove();
		} 
		*/

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
		
		if(!this.mouseMoved && e.target.nodeName == 'CANVAS' && e.button === 0){
			var p = new THREE.Vector3(2 * (e.clientX / window.innerWidth) - 1, 1 - 2 * ( e.clientY / window.innerHeight ), 0);
			p.unproject(this.camera);
			this.raycaster.set(this.camera.position, p.sub(this.camera.position).normalize());
			var intersects = this.raycaster.intersectObject(this.container, true);
			// clicked on object
			if(intersects.length){
				//console.log(intersects);
				this.objectClicked(intersects[0].object);
			// clicked in empty space
			} else if(!(this.shift || this.ctrl || this.alt)){
				this.objectClicked(null);
			}
		}
	},

	mouseMove:function(e){
		this.mouseCoord = { x: e.pageX, y: e.pageY };
		
		if(this.lazyMouse){
			var lazyMouse = new THREE.Vector2(e.pageX, e.pageY);
			var dist = this.lazyMouse.distanceToSquared(lazyMouse);
			if(dist > 5){
				this.mouseMoved = true;
				this.lazyMouse = null;
			}
		}
		
		/*
		// trace ray
		var screenPoint = new THREE.Vector3((this.mouseCoord.x / window.innerWidth ) * 2 - 1, -(this.mouseCoord.y / window.innerHeight ) * 2 + 1, 1.0);
		screenPoint.unproject(this.camera);
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
		}*/
	},

	/* move selection in camera-aligned coord sys */
	moveTool:function(dx, dy){
		// scale
		if(this.alt && this.ctrl){
			var s = 0.25 * (dx ? dx : dy);
			this.scaleSelectionBy(new THREE.Vector3(s, s, s));
		// regular rotate
		} else if(this.alt){
			var r = new THREE.Vector3();
			r.set(dy,dx,null);
			this.rotateSelectionBy(r);
		// alternate rotate
		} else if(this.ctrl){
			var r = new THREE.Vector3();
			r.set(0,dy,dx);
			this.rotateSelectionBy(r);
		// move
		} else {
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
			
			this.moveSelectionBy(posInc);
		}
		this.refreshProps();
	},


/* ------------------- ------------------- ------------------- ------------------- ------------------- Name */

	renameObjects:function(objNameArr){
		for(var i = 0; i < objNameArr.length; i++){
			var obj = objNameArr[i][0];
			obj.name = objNameArr[i][1];
			if(obj.htmlLabel){
				obj.htmlLabel.text(obj.name);
			}
			if(obj.htmlRow){
				obj.htmlRow.children('label').first().text(obj.name);
			}
		}
	},

	renameScene:function(newName){
		this.doc.name = newName;
		$('#scene-list #scene > label').text(newName);
	},

	nameChanged:function(e){
		var doArr = [];
		var undoArr = [];
		var newName = $('#prop-name').val().replace(/\W+/g,'_'); // replace non-word chars with _
		if(newName.match(/^\d+/)){ // prepend _ if starts with a digit
			newName = '_'+newName;
		}
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			undoArr.push([obj, obj.name ]);
			doArr.push([obj, newName]);
		}
		
		if(undoArr.length){ 
			this.addUndo({name:"rename", redo:[this.renameObjects,doArr], undo:[this.renameObjects, undoArr] });
			this.renameObjects(doArr);
		} else {
			this.addUndo({name:"renameScene", redo:[this.renameScene,newName], undo:[this.renameScene, this.doc.name] });
			this.renameScene(newName);
		}
		
		this.refreshProps();
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Move, scale, rotate */

	
	moveObjects:function(objPosArr){
		for(var i = 0; i < objPosArr.length; i++){
			var obj = objPosArr[i][0];
			obj.position.copy(objPosArr[i][1]);
		}
	},

	moveSelectionTo: function(pos){
		var objPosArr = [];
		var undoPosArr = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoPosArr.push([obj, obj.position.clone() ]);
			objPosArr.push([obj,
				new THREE.Vector3(	(pos.x === null ? obj.position.x : pos.x),
									(pos.y === null ? obj.position.y : pos.y),
									(pos.z === null ? obj.position.z : pos.z))
			]);
		}
		
		if(objPosArr.length) this.addUndo({name:"moveTo", mergeable:true, redo:[this.moveObjects, objPosArr], undo:[this.moveObjects, undoPosArr] });
		
		this.moveObjects(objPosArr);
		return objPosArr.length;
	},

	moveSelectionBy: function(pos){
		var objPosArr = [];
		var undoPosArr = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoPosArr.push([obj, obj.position.clone() ]);
			objPosArr.push([obj,
				new THREE.Vector3(	obj.position.x + (pos.x === null ? 0 : pos.x),
									obj.position.y + (pos.y === null ? 0 : pos.y),
									obj.position.z + (pos.z === null ? 0 : pos.z))
			]);
		}
		
		this.moveObjects(objPosArr);		
		if(objPosArr.length) this.addUndo({name:"moveBy", mergeable:true, redo:[this.moveObjects, objPosArr], undo:[this.moveObjects, undoPosArr] });
	},

	rotateObjects:function(objRotArr){
		for(var i = 0; i < objRotArr.length; i++){
			var obj = objRotArr[i][0];
			var rot = objRotArr[i][1];
			if((obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) && rot instanceof THREE.Object3D){
				obj.target = rot;
			} else {
				obj.rotation.copy(rot);
			}
		}
	},

	rotateSelectionTo: function(rot){
		var objRotArr = [];
		var undoRotArr = [];
		var degToRad = Math.PI / 180;
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoRotArr.push([obj, obj.rotation.clone() ]);
			objRotArr.push([obj,
				new THREE.Euler(	(rot.x === null ? obj.rotation.x : (rot.x * degToRad)),
									(rot.y === null ? obj.rotation.y : (rot.y * degToRad)),
									(rot.z === null ? obj.rotation.z : (rot.z * degToRad)))
			]);
		}
		
		this.rotateObjects(objRotArr);
		if(objRotArr.length) this.addUndo({name:"rotateTo", mergeable:true, redo:[this.rotateObjects, objRotArr], undo:[this.rotateObjects, undoRotArr] });
		return objRotArr.length;
	},

	rotateSelectionBy: function(rot){
		var objRotArr = [];
		var undoRotArr = [];
		var degToRad = Math.PI / 180;
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoRotArr.push([obj, obj.rotation.clone() ]);
			objRotArr.push([obj,
				new THREE.Euler(	obj.rotation.x + (rot.x === null ? 0 : (rot.x * degToRad)),
									obj.rotation.y + (rot.y === null ? 0 : (rot.y * degToRad)),
									obj.rotation.z + (rot.z === null ? 0 : (rot.z * degToRad)))
			]);
		}
		
		if(objRotArr.length) this.addUndo({name:"rotateBy", mergeable:true, redo:[this.rotateObjects, objRotArr], undo:[this.rotateObjects, undoRotArr] });
		
		this.rotateObjects(objRotArr);
		
	},
	
	scaleObjects:function(objScaleArr){
		for(var i = 0; i < objScaleArr.length; i++){
			objScaleArr[i][0].scale.copy(objScaleArr[i][1]);
		}
	},

	scaleSelectionTo: function(scale){
		var objScaleArr = [];
		var undoScaleArr = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoScaleArr.push([obj, obj.scale.clone() ]);
			objScaleArr.push([obj,
				new THREE.Vector3(	(scale.x === null ? obj.scale.x : scale.x),
									(scale.y === null ? obj.scale.y : scale.y),
									(scale.z === null ? obj.scale.z : scale.z))
			]);
		}
		
		this.scaleObjects(objScaleArr);
		if(objScaleArr.length) this.addUndo({name:"scaleTo", mergeable:true, redo:[this.scaleObjects, objScaleArr], undo:[this.scaleObjects, undoScaleArr] });
		
		return objScaleArr.length;
	},

	scaleSelectionBy: function(scale){
		var objScaleArr = [];
		var undoScaleArr = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoScaleArr.push([obj, obj.scale.clone() ]);
			objScaleArr.push([obj,
				new THREE.Vector3(	obj.scale.x + (scale.x === null ? 0 : scale.x),
									obj.scale.y + (scale.y === null ? 0 : scale.y),
									obj.scale.z + (scale.z === null ? 0 : scale.z))
			]);
		}
		
		if(objScaleArr.length) this.addUndo({name:"scaleBy", mergeable:true, redo:[this.scaleObjects, objScaleArr], undo:[this.scaleObjects, undoScaleArr] });
		
		this.scaleObjects(objScaleArr);
		
	},
	
	lookAtSelection: function(targ){
		if(targ.selected) return;
		var objRotArr = [];
		var undoRotArr = [];
		var degToRad = Math.PI / 180;
		var wp = new THREE.Vector3();
		targ.localToWorld(wp);
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			if(obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight){
				// if(targ.isAnchor && (targ.parent == obj.parent || (obj.parent.isAnchor && obj.parent.parent == targ.parent))){
				undoRotArr.push([obj, obj.target ]);
				obj.target = targ;
				objRotArr.push([obj, targ]);
			} else {
				undoRotArr.push([obj, obj.rotation.clone() ]);
				obj.lookAt(wp);
				objRotArr.push([obj, obj.rotation.clone()]);
			}
		}
		if(!objRotArr.length) return;
		this.addUndo({name:"lookAt", redo:[this.rotateObjects, objRotArr], undo:[this.rotateObjects, undoRotArr] });
		this.refreshProps();
	},
	
	lookAtClicked:function(e){
		if($(e.target).attr('disabled')) return;
		if(editScene.objectPickMode){
			editScene.objectPickMode(null);
			return;
		}
		
		$('#look-at').addClass('active');
		$('canvas,.object-label,#scene-list div.row:not(.selected),#scene-list div.row:not(.selected) > label').css('cursor','cell');
		editScene.objectPickMode = function(obj){
			if(obj){
				editScene.lookAtSelection(obj);
			}
			$('#look-at').removeClass('active');
			editScene.objectPickMode = null;
			$('canvas,.object-label,#scene-list div.row:not(.selected),#scene-list div.row:not(.selected) > label').css('cursor','');
		};
	},
	
	updateStoredPosition:function(){
		this.storedTransform = this.storedTransform ? this.storedTransform : {pos:null,rot:null,scale:null};
		if(this.storedTransform.pos){
			var tt = '{'+(this.storedTransform.pos[0] != '' ? this.storedTransform.pos[0] : '*') + ','
					+(this.storedTransform.pos[1] != '' ? this.storedTransform.pos[1] : '*') + ','
					+(this.storedTransform.pos[2] != '' ? this.storedTransform.pos[2] : '*') + '}';
			$('#store-pos').attr('disabled','disabled').attr('title',tt);
			$('#clear-pos').removeAttr('disabled').attr('title',tt);
		} else {
			$('#store-pos').removeAttr('disabled').removeAttr('title');
			$('#clear-pos').attr('disabled','disabled').removeAttr('title');
		}
		if(this.storedTransform.rot){
			var tt = '{'+(this.storedTransform.rot[0] != '' ? this.storedTransform.rot[0] : '*') + ','
					+(this.storedTransform.rot[1] != '' ? this.storedTransform.rot[1] : '*') + ','
					+(this.storedTransform.rot[2] != '' ? this.storedTransform.rot[2] : '*') + '}';
			$('#store-rot').attr('disabled','disabled').attr('title',tt);
			$('#clear-rot').removeAttr('disabled').attr('title',tt);
		} else {
			$('#store-rot').removeAttr('disabled').removeAttr('title');
			$('#clear-rot').attr('disabled','disabled').removeAttr('title');	
		}
		if(this.storedTransform.scale){
			var tt = '{'+(this.storedTransform.scale[0] != '' ? this.storedTransform.scale[0] : '*') + ','
					+(this.storedTransform.scale[1] != '' ? this.storedTransform.scale[1] : '*') + ','
					+(this.storedTransform.scale[2] != '' ? this.storedTransform.scale[2] : '*') + '}';
			$('#store-scale').attr('disabled','disabled').attr('title',tt);
			$('#clear-scale').removeAttr('disabled').attr('title',tt);
		} else {
			$('#store-scale').removeAttr('disabled').removeAttr('title');
			$('#clear-scale').attr('disabled','disabled').removeAttr('title');
		}
		
		if((this.storedTransform.pos || this.storedTransform.rot || this.storedTransform.scale) && !($('#prop-x').attr('disabled'))){
			$('#restore-pos').removeAttr('disabled');
		} else {
			$('#restore-pos').attr('disabled','disabled');	
		}

	},
	
	restorePosition:function(){
		var v = new THREE.Vector3();
		var numAffected = 0;
		if(this.storedTransform.pos){
			v.x = this.storedTransform.pos[0] === '' ? null : parseFloat(this.storedTransform.pos[0]);
			v.y = this.storedTransform.pos[1] === '' ? null : parseFloat(this.storedTransform.pos[1]);
			v.z = this.storedTransform.pos[2] === '' ? null : parseFloat(this.storedTransform.pos[2]);
			if(this.moveSelectionTo(v)) numAffected++;
		}
		if(this.storedTransform.rot){
			v.x = this.storedTransform.rot[0] === '' ? null : parseFloat(this.storedTransform.rot[0]);
			v.y = this.storedTransform.rot[1] === '' ? null : parseFloat(this.storedTransform.rot[1]);
			v.z = this.storedTransform.rot[2] === '' ? null : parseFloat(this.storedTransform.rot[2]);
			if(this.rotateSelectionTo(v)) numAffected++;
		}
		if(this.storedTransform.scale){
			v.x = this.storedTransform.scale[0] === '' ? null : parseFloat(this.storedTransform.scale[0]);
			v.y = this.storedTransform.scale[1] === '' ? null : parseFloat(this.storedTransform.scale[1]);
			v.z = this.storedTransform.scale[2] === '' ? null : parseFloat(this.storedTransform.scale[2]);
			if(this.scaleSelectionTo(v)) numAffected++;
		}
		
		if(numAffected > 1){
			this.joinUndoActions(numAffected);
		}
		this.undoChanged();
		this.refreshProps();
	},
	
	storePosition:function(e){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.pos = [$('#prop-x').val(), $('#prop-y').val(), $('#prop-z').val()];
		editScene.updateStoredPosition();
	},

	storeRotation:function(e){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.rot = [$('#prop-rx').val(), $('#prop-ry').val(), $('#prop-rz').val()];
		editScene.updateStoredPosition();
	},

	storeScale:function(e){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.scale = [$('#prop-sx').val(), $('#prop-sy').val(), $('#prop-sz').val()];
		editScene.updateStoredPosition();
	},

	clearStorePosition:function(e){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.pos = null;
		editScene.updateStoredPosition();
	},

	clearStoreRotation:function(e){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.rot = null;
		editScene.updateStoredPosition();
	},

	clearStoreScale:function(){
		if($(e.target).attr('disabled')) return;
		editScene.storedTransform.scale = null;
		editScene.updateStoredPosition();
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Add, copy, paste, delete */

	objectAddedRecusive:function(obj){
		if(obj.helper && !obj.helper.parent){
			this.scene.add(obj.helper);
		}
		for(var i = 0; i < obj.children.length; i++){
			this.objectAddedRecusive(obj.children[i]);
		}
	},
	
	objectDeletedRecusive:function(obj){
		if(obj.htmlLabel){
			obj.htmlLabel.remove();
			delete obj.htmlLabel;
		}
		if(obj.htmlRow){
			obj.htmlRow.remove();
			delete obj.htmlRow;
		}
		if(obj.helper && obj.helper.parent){
			obj.helper.parent.remove(obj.helper);
		}
		for(var i = 0; i < obj.children.length; i++){
			this.objectDeletedRecusive(obj.children[i]);
		}
	},

	deleteObjects:function(objs){
		for(var i = 0; i < objs.length; i++){
			var obj = objs[i];
			this.objectDeletedRecusive(obj);
			obj.parent.remove(objs[i]);
		}
		THREE.PixelBox.updateLights(this.scene, true);
		this.refreshScene();
		this.refreshAssets();
	},
	
	addObjects:function(objParArr){
		for(var i = 0; i < objParArr.length; i++){
			var obj = objParArr[i][0];
			var p = objParArr[i][1];
			p.add(obj);
			this.objectAddedRecusive(obj);
		}
		THREE.PixelBox.updateLights(this.scene, true);
		this.refreshScene();
		this.refreshAssets();
	},
	
	deleteSelection:function(){
		var doArr = [];
		var undoArr = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			undoArr.push([obj, obj.parent]);
			doArr.push(obj);
		}
		
		if(doArr.length) { 
			this.addUndo({name:"delete", redo:[this.deleteObjects, doArr], undo:[this.addObjects, undoArr] });
			this.deselectAll();
			this.deleteObjects(doArr);
		}
	},
	
	copySelection:function(){
		var toCopy = [];
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			if(obj.isAnchor) continue;
			toCopy.push(obj);
		}
		// check hierarchy
		for(var i = toCopy.length - 1; i >= 0; i--){
			var obj = toCopy[i];
			for(var j = toCopy.length - 1; j >= 0; j--){
				if(i == j) continue;
				var obj2 = toCopy[j];
				if(obj2.isDescendentOf(obj)){
					toCopy.splice(i, 1);
					break;
				}
			}
		}
		if(!toCopy.length) return;
		for(var i = toCopy.length - 1; i >= 0; i--){
			toCopy[i] = toCopy[i].serialize(null);
		}
		
		// store
		var ss = JSON.stringify(toCopy);
		localStorage_setItem("sceneCopy", ss);
		
		console.log(toCopy);
		this.sceneCopyItem = toCopy;// copied
	},
	
	cutSelection:function(){
		this.copySelection();
		this.deleteSelection();
	},
	
	pasteSelection:function(){
		if(this.objectPickMode){ this.objectPickMode(null); }
		
		var pasteTarget = this.selectedObjects.length ? this.selectedObjects[0].parent : this.container;
		
		var addedObjects = this.populateObject(pasteTarget, this.sceneCopyItem, { helpers: true, createCameras:true, noNameReferences:true });
		THREE.PixelBox.updateLights(this.scene, true);
		var doAdd = [];
		for(var i = 0; i < addedObjects.length; i++){
			doAdd.push([addedObjects[i], pasteTarget]);
		}
		this.addUndo({name:"paste", redo:[this.addObjects, addedObjects], undo:[this.deleteObjects, addedObjects] });
		
		this.refreshScene();
		this.controls.focus(pasteTarget, true);
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Reparent */
	
	parentObjects:function(objArr){
		for(var i = 0; i < objArr.length; i++){
			var obj = objArr[i][0];
			var np = objArr[i][1];
			np.add(obj);
		}
		this.refreshScene();
	},
	
	reparentDraggedRowsTo:function(newParent){
		//console.log("Reparent ",this.reparentObjects," to ",newParent);
		
		var doArr = [];
		var undoArr = [];
		for(var i = 0; i < this.reparentObjects.length; i++){
			var obj = this.reparentObjects[i];
			undoArr.push([obj, obj.parent ]);
			doArr.push([obj, newParent]);
		}
		this.addUndo({name:"reparent", redo:[this.parentObjects, doArr], undo:[this.parentObjects, undoArr] });
		this.parentObjects(doArr);
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Container & display functions */

	/* called after new doc is created to recreate container with axis */
	createContainer:function(){
		// clear container
		if(this.container){
			this.scene.recursiveRemoveChildren([this.camera, this.axis, this.ambient, this.scene.fog]);
		} else if(!this.axis){
			var axis = this.axis = new THREE.AxisHelper(10);
			axis.raycast = function(){ return; };// skip raycase
			this.scene.add(axis);
		}
		
		this.container = new THREE.Object3D();
		this.scene.add(this.container);
	},
	
	resetZoom:function(){
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.controls.focus(this.container, true);
	},
	
	/* updates text labels on all elements in container, recursive */
	updateTextLabels: function(cont, depth){
		if(!cont) return;
		var p = new THREE.Vector3();
		var windowInnerWidth = window.innerWidth;
		var windowInnerHeight = window.innerHeight;
		for(var i = 0; i < cont.children.length; i++){
			var obj = cont.children[i];
			if(obj.isHelper){
				if(obj['update']) obj.update();
				continue;
			}
			if(!obj.htmlLabel){
				obj.htmlLabel = $('<label id="'+obj.uuid+'" class="object-label" style="color:'+this.automaticColorForIndex(obj.id, 1, false)+'"/>').text(obj.name);
				if(obj.isAnchor) obj.htmlLabel.css({'background-color':'transparent', 'font-size':'8px','font-weight':'normal'});
				obj.htmlLabel.click(this.objectLabelClicked);
				$(document.body).append(obj.htmlLabel);
			}
			p.set(0,0,0);
			obj.localToWorld(p);
			p.project(this.camera);
			var offs = depth * (obj.isAnchor ? -5 : 8);
			var lw = obj.htmlLabel.width();
			var lh = obj.htmlLabel.height();
			var x = Math.max(0, Math.min(windowInnerWidth - lw - 20, 
								Math.floor(windowInnerWidth * 0.5 * p.x + windowInnerWidth * 0.5 - lw * 0.5)));
			var y = Math.max(0, Math.min(windowInnerHeight - lh - 10, 
					Math.floor(windowInnerHeight * 0.5 - windowInnerHeight * 0.5 * p.y - lh * 0.5) + offs));
			obj.htmlLabel.offset({top:y, left:x});
			this.updateTextLabels(obj, depth + 1);
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Util */


	/* used during loading */
	populateObject: Scene.prototype.populateObject,
	
	getObjectFromPool:function(){ return null; },
	
	hashStringToInt:function(s){
	  return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
	},
	
	automaticColorForIndex: function(id, alpha, returnColorObject){
		var i = (typeof(id) == 'string' ? this.hashStringToInt(id) : id);
	
		var hue = ((i + (i % 2 ? 5 : 1)) % 10) * 0.1;
		var sat = 0.9 - 0.6 * (Math.floor(i * 0.1) % 5) / 5;
		var color = new THREE.Color();
		color.setHSL(hue, sat, 0.6);
		
		if(returnColorObject) return color;
		
		return 'rgba('+Math.floor(color.r * 255.0)+','+Math.floor(color.g * 255.0)+','+Math.floor(color.b * 255.0)+','+alpha+')';
	},
	
	makeDownloadLink:function(filename, contents) {
	  var pom = document.createElement('a');
	  pom.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(contents));
	  pom.setAttribute('download', filename);
	  pom.setAttribute('target', '_blank');
	  // pom.click();
	  return pom;
	},


/* ------------------- ------------------- ------------------- ------------------- ------------------- Document functions */

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
	      	localStorage_clear();
	      	$(this).dialog("close"); 
	      	if(chrome && chrome.storage){
		      	chrome.runtime.reload();
	      	} else {
	      		window.location.reload();
	      	}
	      } },
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});
		editScene.disableCanvasInteractions(true);
	},
	
	/* store localStore */
	holdDoc:function(){	
		function doHold(){
			var data = editScene.createDataObject(editScene.doc);
			data = JSON.stringify(data);
			localStorage_setItem('holdScene', data);
		}
		
		if(localStorage_getItem('holdScene')){
			$('<div id="editor-hold" class="editor">\
			<div class="center">This will replace current "Hold" object.</div>\
			</div>').dialog({
		      resizable: false, width: 400, height:220, modal: true, dialogClass:'no-close', title:"Replace Hold?",
		      buttons: { 
		      "Replace": function() { 
		      	doHold();
		      	$(this).dialog("close"); 
		      },
		      "Cancel": function() { 
		      	$(this).dialog("close"); 
		      }
		      },
		      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
			});
			editScene.disableCanvasInteractions(true);
		} else doHold();
	},
	
	/* restore */
	fetchDoc:function(){
		var data = localStorage_getItem('holdScene');
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
			//localStorage_setItem('save-compress', $('#save-compress').get(0).checked);
			//localStorage_setItem('save-raw', $('#save-raw').get(0).checked);
			
			var data = editScene.createDataObject(editScene.doc);
			
			data = JSON.stringify(data);
			//data = LZString.compressToBase64(data);
			
			$('#save-size').text(data.length + ' chars');
			$('#editor-save textarea').text(data);
		};

		
		var dlg = $('<div id="editor-save" class="editor">\
		<label for="save-name" class="pad5 w2">Name&nbsp;&nbsp;</label><input type="text" class="w4" id="save-name"/>\
		&nbsp;&nbsp;&nbsp;<button id="save-select">Select All</button>\
		<hr/>\
		<textarea readonly="readonly"></textarea>\
		<hr/>\
		<label for="save-compress" class="pad5">LZString - compress&nbsp;&nbsp;</label><input type="checkbox" id="save-compress"/>-->\
		<span id="save-size" class="flush-right">chars</span><br/>\
		<label for="save-raw" class="pad5">Raw (faster loading, bigger file)&nbsp;&nbsp;</label><input type="checkbox" id="save-raw"/>\
		<span class="info">Copy and paste above into a file</span>\
		</div>');
		
		$('#save-name', dlg).val(editScene.doc.name).change(refresh);
		$('#save-compress', dlg).change(refresh).get(0).checked = (localStorage_getItem('save-compress') == 'true');
		$('#save-raw', dlg).change(refresh).get(0).checked = (localStorage_getItem('save-raw') == 'true');
		$('#save-select', dlg).button().click(function(){ $('#editor-save textarea').get(0).select();});
		editScene.disableCanvasInteractions(true);
		
		dlg.dialog({
	      resizable: false, width: 400, height:470, modal: true, dialogClass:'no-close', title:"Export Data",
	      buttons: { OK: function() { $(this).dialog("close"); } },
	      open: refresh,
	      close: function(){ $(this).remove(); editScene.enableCanvasInteractions(true); }
		});

	},

	/* export doc */
	loadDoc:function(){
		$('<div id="editor-load" class="editor">\
		<span class="info">Drag &amp; drop files below.</span>\
		<span class="info">Accepting .scene file to load scene, and .b64 files to load or replace PixelBox assets.</span>\
		<span class="info">This operation is not undo-able.</span>\
		<div id="drop-files"/>\
		</div>').dialog({
	      resizable: false, width: 400, height:400, modal: true, dialogClass:'no-close', title:"Import",
	      buttons: { 
	      	"Import": function() {
	      	
	      		// unload assets first if loading a scene
	      		for(var i in editScene.toImport){
		      		if(editScene.toImport[i].name.indexOf('.scene') > 0){
		      			editScene.newDoc(true, false);
			      		assets.unload();
			      		break;
		      		}
	      		}
	      	
	      		var reader = new FileReader();
	      		reader.onload = editScene.fileImported;
	      		reader.readAsText(editScene.toImport[0]);
		      	
		      	$(this).dialog("close"); 
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
	newDoc:function(e, createDefaults){
		if(e === true){
			var bgColor = localStorage_getItem('editor-scene-bg-color');
			if(!bgColor) bgColor = '000000';
			this.doc = {
				name: "newScene",
				clearColor: new THREE.Color(parseInt(bgColor, 16)),
				ambient: new THREE.Color(0),
				fogColor: new THREE.Color(0),
				fogNear: 1000,
				fogFar: 10000
			};
			this.clearColor = this.doc.clearColor.getHex();
			this.deselectAll();
			$('.object-label').remove();
			this.createContainer();
			if(createDefaults){
				this.newDocFromData(this.defaultSceneDef);
			} else {
				this.initUndo();
				setTimeout(this.resetZoom.bind(this), 500);
			}
			this.refreshAssets();
			this.refreshProps();
			this.refreshScene();
		} else {
			if(!$('#new-doc').length){
				$('body').append('<div id="new-doc" class="center no-close">\
				Create new scene?\
				</div>');
			    $('#new-width,#new-height,#new-depth').spinner({min: 4, max: 256, step: 4 });
			}
	      	editScene.disableCanvasInteractions(true);
			$('#new-doc').dialog({
		      resizable: false, width: 250, height:360, modal: true, dialogClass:'no-close', title:"Create New",
		      buttons: {
		        "Create": function() {
		          assets.unload();
		          editScene.newDoc(true, true);
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
	    }
	},

	/* imports frames from JSON'ed object */
	newDocFromData:function(dataObject, skipNewDoc){
	
		this.deselectAll();
		$('.object-label').remove();
		this.createContainer();
		
		this.doc = dataObject;
		
		// update props
		this.doc.clearColor = new THREE.Color(this.doc.clearColor ? parseInt(this.doc.clearColor,16) : 0);
		this.doc.ambient = new THREE.Color(this.doc.ambient ? parseInt(this.doc.ambient,16) : 0);
		this.doc.fogColor = new THREE.Color(this.doc.fogColor ? parseInt(this.doc.fogColor,16) : 0);
		this.clearColor = this.doc.clearColor.getHex();
		this.ambient.color.copy(this.doc.ambient);
		this.scene.fog.color.copy(this.doc.fogColor);
		this.scene.fog.near = this.doc.fogNear;
		this.scene.fog.far = this.doc.fogFar;
		
		// add assets to cache if needed
		for(var i in dataObject.assets){
			var asset = dataObject.assets[i];
			// compressed PixelBox asset
			if(typeof(asset) == 'string'){
				var json = LZString.decompressFromBase64(asset);
				if(!json){
					console.error("Failed to LZString decompressFromBase64: ", asset);
					continue;
				}
				try {
					asset = JSON.parse(json);
				} catch(e){
					console.error("Failed to parse JSON ",e,json);
				}
			}
			// add asset to cache if needed
			if(!assets.cache.get(asset.name)){
				assets.cache.add(asset.name, asset);
				sceneDef.assets[i] = asset;
			}
		}
		
		// populate
		this.populateObject(this.container, dataObject.layers, { helpers: true, createCameras:true, noNameReferences: true });
		THREE.PixelBox.updateLights(this.scene, true);
		
		// clear undo queue
		this.initUndo();
		this.resetZoom();
		
		// refresh
		editScene.refreshAssets();
		editScene.refreshScene();
		editScene.refreshProps();
	},
	
	createDataObject:function(options){
		var obj = {
			name:(options['name'] ? options['name'] : null),
			assets:(options['assets'] ? options['assets'] : {})
		};
		
		return obj;
	},
	
	onDragFilesOver:function(e){
		e.preventDefault();
		e.stopPropagation();
		if(e.type == 'dragover' && !$('#editor-load').length){
			editScene.toImport = [];
			editScene.loadDoc();
		}
	},
	
	onDropFiles:function(e){
		e.preventDefault();
		e.stopPropagation();
		document.body.focus();
		var evt = e.originalEvent;
		var dt = evt.dataTransfer;
		if(dt){
			var added = $('#drop-files span.file');
			for(var i = 0; i < dt.files.length; i++){
				var nfd = dt.files[i];
				var ext = nfd.name.substr(nfd.name.lastIndexOf('.')+1);
				if(!nfd.size || (ext != 'b64' && ext != 'scene')) continue;
				
				// skip if already there
				var skip = false;
				for(var f = 0; f < added.length; f++){
					var fd = $(added[f]).data();
					if(fd && fd.name == nfd.name) {
						skip = true;
						break;
					}
				}
				if(skip) continue;
				// add
				var ax = $('<a>[X]</a>&nbsp;').click(function(){
					var name = $(this).parent().data().name;
					$(this).parent().remove();
					for(var i = 0; i < editScene.toImport.length; i++){ 
						if(editScene.toImport[i].name == name) { editScene.toImport.splice(i, 1); return; }
					}
				});
				var span = $('<span class="file"></span>').addClass(ext).text(nfd.name).data(nfd).prepend(ax);
				added.push(span[0]);
				// scene imported last
				if(ext == 'scene'){ // first
					editScene.toImport.push(nfd);
				// assets first
				} else {
					editScene.toImport.splice(0, 0, nfd);
				}
				$('#drop-files').append(span);
			}
			//console.log(dt);
		}
	},
	
	/* called for each dragged in imported file */
	fileImported:function(e){
		var data = e.target.result;
		
		editScene.toImport.splice(0, 1);
	   	
  		// parse
  		if(data.length) {
	  		var err = null;
	  		if(data.substr(0,1) != '{'){
	  			try {
	  				data = LZString.decompressFromBase64(data);
	  				if(!data) throw 1;
	  			} catch(e) {
	  				err = "Unable to LZString decompress string (File size: "+e.loaded+")";
	  			}
	  		}
	  		
	  		if(!err){
	  			try {
	  				data = JSON.parse(data);
	  			} catch(e){ err = "Unable to parse JSON (File size: "+e.loaded+")"; console.error(e); }
	  		}
	  		
	  		if(err){
	      		alert(err);
	      	} else {
		      	//console.log(data);
		      	
		      	// asset
		      	if(data.width){
			     	// replace scene asset with updated one
			     	editScene.importSceneAsset(data);
			    // scene
		      	} else {
			   		editScene.newDocFromData(data);
		      	}	
	      	}
      	}	
      	
      	// next
      	if(editScene.toImport.length){
	   		var reader = new FileReader();
	   		reader.onload = editScene.fileImported;
	   		reader.readAsText(editScene.toImport[0]);
	   	}
	},
	
/* ------------------- ------------------- ------------------- ------------------- ------------------- Scene & asset functions */

	/* called to update placeholders, or to replace existing assets */
	importSceneAsset: function(newAsset){
		newAsset.importedAsset = _.deepClone(newAsset, 100);
     	THREE.PixelBox.prototype.processPixelBoxFrames(newAsset);
	
		var replaced = [];
		var replaceUndoObjects = { };
		do {
			replaced.length = 0;
			var trav = function(obj3d){
				var newObj = null;
				// Replace placeholder with imported asset
				if(obj3d.isPlaceholder && obj3d.def.asset == newAsset.name){
					newObj = new THREE.PixelBox(newAsset);
					// transplant children
					for(var i = obj3d.children.length - 1; i >= 0; i--){
						var child = obj3d.children[i];
						obj3d.remove(child);
						// anchored child is added to new obj's anchor of same name
						if(child.anchored && newObj.anchors[child.anchored]){
							newObj.anchors[child.anchored].add(child);
						// transplant
						} else {
							newObj.add(child);
							child.anchored = false;
						}
						if(child.def && child.def.target && newObj.anchors[child.def.target]){
							replaceUndoObjects[child.def.target.uuid] = newObj.anchors[child.def.target];
							child.target = newObj.anchors[child.def.target];
						}
					}
					
				// Replace existing asset
				} else if(obj3d instanceof THREE.PointCloud && obj3d.geometry.data != newAsset && obj3d.geometry.data.name == newAsset.name){
					newObj = new THREE.PixelBox(newAsset);
					// transplant children
					for(var i = obj3d.children.length - 1; i >= 0; i--){
						var child = obj3d.children[i];
						// transplant anchor's children to new anchor with same name
						if(child.isAnchor) {
							replaceUndoObjects[child.uuid] = newObj.anchors[child.name];
							for(var j = child.children.length - 1; j >= 0; j--){
								var subchild = child.children[j];
								child.remove(subchild);
								// anchored subchild is added to new obj's anchor of same name
								if(newObj.anchors[child.name]){
									newObj.anchors[child.name].add(subchild);
								// no mathing anchor in new object, add as child
								} else {
									newObj.add(subchild);
									subchild.anchored = false;
								}
								// subchild had named target (anchor name)
								if(subchild.def.target && newObj.anchors[subchild.def.target]){
									replaceUndoObjects[subchild.target.uuid] = newObj.anchors[subchild.def.target];
									subchild.target = newObj.anchors[subchild.def.target];
								}
								// update helper
								if(subchild.helper) subchild.helper.update(); 
							}
							// delete html
							if(child.htmlLabel) child.htmlLabel.remove();
							if(child.htmlRow) child.htmlRow.remove();
							child.htmlLabel = child.htmlRow = null;
							
						// regular, non-anchor child
						} else {
							obj3d.remove(child);
							// anchored child is added to new obj's anchor of same name
							if(child.anchored && newObj.anchors[child.anchored]){
								newObj.anchors[child.anchored].add(child);
							// transplant
							} else {
								newObj.add(child);
								child.anchored = false;
							}
							// update helper
							if(child.helper) child.helper.update();
						}						
					}
				}
				
				// populate new object
				if(newObj){
					newObj.anchored = obj3d.anchored;
					
					// update name
					if(obj3d.name){
						if(obj3d.anchored){
							obj3d.parent.parent[obj3d.name] = newObj;
						} else {
							obj3d.parent[obj3d.name] = newObj;
						}
					}
				
					// copy common props
					newObj.def = obj3d.def;
					newObj.name = obj3d.name;
					newObj.position.copy(obj3d.position);
					newObj.scale.copy(obj3d.scale);
					newObj.rotation.copy(obj3d.rotation);
					
					var layer = newObj.def;
					// copy pixelbox props from def
					if(layer.pointSize != undefined) { 
						newObj.pointSize = layer.pointSize;
					} else {
						var maxScale = Math.max(newObj.scale.x, newObj.scale.y, newObj.scale.z);
						newObj.pointSize = maxScale + 0.1;
					}
					if(layer.alpha != undefined) { 
						newObj.alpha = layer.alpha;
					}			
					if(layer.cullBack != undefined) newObj.cullBack = layer.cullBack;
					if(layer.occlusion != undefined) newObj.occlusion = layer.occlusion;
					if(layer.tint != undefined) { 
						if(layer.tint instanceof String) newObj.tint.set(parseInt(layer.tint, 16));
						else newObj.tint.copy(layer.tint);
					} else {
						newObj.tint.set(0xffffff);
					}
					if(layer.add != undefined) { 
						newObj.addColor.set(parseInt(layer.add, 16));
					} else {
						newObj.addColor.set(0x0);
					}					
					if(layer.stipple != undefined) { 
						newObj.stipple = layer.stipple;
					} else {
						newObj.stipple = 0;
					}
					if(layer.animSpeed != undefined) newObj.animSpeed = layer.animSpeed;
					if(layer.gotoAndStop != undefined){
						if(_.isArray(layer.gotoAndStop)){
							newObj.gotoAndStop(layer.gotoAndStop[0], layer.gotoAndStop[1]);
						} else if(typeof(layer.gotoAndStop) == 'string'){
							newObj.gotoAndStop(layer.gotoAndStop, 0);
						} else {
							newObj.frame = layer.gotoAndStop;
						}
					}
					if(layer.loopAnim != undefined) newObj.loopAnim(layer.loopAnim,Infinity,true);
					if(layer.loopFrom != undefined) { 
						newObj.gotoAndStop(layer.loopFrom[0], layer.loopFrom[1]); 
						newObj.loopAnim(layer.loopFrom[0],Infinity,true);
					}
					if(layer.playAnim != undefined) { 
						newObj.playAnim(layer.playAnim);
					}					
					
					// add to same parent
					replaced.push([obj3d, newObj]);
				}			
			};
			this.container.traverse(trav);
			
			// replace/reparent objects
			for(var i = 0; i < replaced.length; i++){ 
				var oldObj = replaced[i][0];
				var newObj = replaced[i][1];
				replaceUndoObjects[oldObj.uuid] = newObj;
				var p = oldObj.parent;
				// delete html
				if(oldObj.htmlLabel) oldObj.htmlLabel.remove();
				if(oldObj.htmlRow) oldObj.htmlRow.remove();
				oldObj.htmlLabel = oldObj.htmlRow = null;
				p.remove(oldObj);
				p.add(newObj);
			}
					
		} while(replaced.length);
		
		// dispose of old asset
		var oldAsset = assets.cache.get(newAsset.name);
		if(oldAsset){
			THREE.PixelBox.prototype.dispose(oldAsset);
		}
		// add new asset to cache
		assets.cache.add(newAsset.name, newAsset);
		
		// update undo references
		editScene.replaceReferencesInUndo(replaceUndoObjects);
		
		// refresh
		editScene.refreshAssets();
		editScene.refreshScene();
		editScene.refreshProps();
	},
	
	setSceneAmbientColor:function(hex){
		editScene.addUndo({name:'sceneAmbientColor',
			undo:[editScene.setSceneAmbientColor, editScene.doc.ambient.getHexString()],
			redo:[editScene.setSceneAmbientColor, hex]});

		$('#scene-ambient-color').css({backgroundColor: hex});
		editScene.ambient.color.setHex(parseInt(hex,16));
		editScene.doc.ambient.copy(editScene.ambient.color);
	},
	
	setSceneFogColor:function(hex){
		editScene.addUndo({name:'sceneAmbientColor',
			undo:[editScene.setSceneFogColor, editScene.doc.fogColor.getHexString()],
			redo:[editScene.setSceneFogColor, hex]});

		$('#scene-fog-color').css({backgroundColor: hex});
		editScene.scene.fog.color.setHex(parseInt(hex,16));
		editScene.doc.fogColor.copy(editScene.scene.fog.color);
	},
	
	setSceneFogNear:function(val){
		this.addUndo({name:"setFogNear", mergeable:true, undo:[this.setSceneFogNear, this.doc.fogNear], redo:[this.setSceneFogNear, val]});
		this.scene.fog.near = val;
		this.doc.fogNear = val;
	},

	setSceneFogFar:function(val){
		this.addUndo({name:"setFogFar", mergeable:true, undo:[this.setSceneFogFar, this.doc.fogFar], redo:[this.setSceneFogFar, val]});
		this.scene.fog.far = val;
		this.doc.fogFar = val;
	},
	
	setSceneClearColor:function(hex){
		editScene.addUndo({name:'sceneClearColor',
			undo:[editScene.setSceneClearColor, editScene.doc.clearColor.getHexString()],
			redo:[editScene.setSceneClearColor, hex]});

		$('#scene-color').css({backgroundColor: hex});
		editScene.clearColor = parseInt(hex,16);
		editScene.doc.clearColor.setHex(editScene.clearColor);
		localStorage_setItem('editor-scene-bg-color', hex);
	},
	
	setSceneMaxShadows:function(maxShadows){
		this.addUndo({name:"setMaxShadows", mergeable:true, undo:[this.setSceneMaxShadows, this.doc.maxShadows], redo:[this.setSceneMaxShadows, maxShadows]});
		this.doc.maxShadows = maxShadows;
	},
		

/* ------------------- ------------------- ------------------- ------------------- ------------------- Scene panel & object picking */

	sceneSortFunc:function(a, b){
		if(a.isHelper) return 1;
		if(b.isHelper) return -1;
		
		// compare types
		var atype = a.isAnchor ? ' anchor' : (a.def ? a.def.asset.toLowerCase() : '?');
		var btype = b.isAnchor ? ' anchor' : (b.def ? b.def.asset.toLowerCase() : '?');
		if(atype < btype) return -1;
		if(btype < atype) return 1;

		// compare names
		var aname = a.name ? (a.name.length ? a.name : '(Object)') : '(Object)';
		var bname = b.name ? (b.name.length ? b.name : '(Object)') : '(Object)';
		if(aname < bname) return -1;
		if(bname < aname) return 1;
		if(a.id < b.id) return -1;
		return 1;
	},
	
	refreshScene:function(){
		var list = $('#scene-list');
		var sceneRow = $('<div class="row" id="scene"><div class="selection"/><div class="droptarget"/><a class="toggle">-</a><label/></div>');
		sceneRow.find('label:first').text(this.doc.name);
		var prevChildren = list.children();
		prevChildren = prevChildren.remove().find('div.row.collapsed');
		list.append(sceneRow);
		
		// traverse
		editScene.container.traverse(function(obj3d){
			obj3d.children.sort(editScene.sceneSortFunc);
		
			if(obj3d.isHelper || obj3d == editScene.container || obj3d.parent.isHelper) return;
			
			if(obj3d.htmlRow) obj3d.htmlRow.remove();
			var color = editScene.automaticColorForIndex(obj3d.id, 1.0);
			var type = obj3d.isAnchor ? 'Anchor' : (obj3d.def ? obj3d.def.asset : '?');
			obj3d.htmlRow = $('<div class="row" id="row-'+obj3d.uuid+'"><div class="selection"/><div class="droptarget"/>\
				<a class="toggle">-</a><div class="tiny-swatch" style="background-color:'+color+'"/><label/>\
				<span class="type">'+type+'</span></div>');
			if(obj3d.isPlaceholder) obj3d.htmlRow.addClass('missing');
			var name = obj3d.name ? (obj3d.name.length ? obj3d.name : '(Object)') : '(Object)';
			obj3d.htmlRow.find('label').text(name).attr('alt',obj3d.uuid);
			obj3d.htmlRow.click(editScene.objectRowClicked);
			obj3d.htmlRow.addClass(type);
			if(!obj3d.visible) obj3d.htmlRow.addClass('hidden');
			if(obj3d.isTemplate) obj3d.htmlRow.addClass('template');
			if(!obj3d.children.length) obj3d.htmlRow.children('a.toggle').css({visibility:'hidden'});
			if(obj3d.selected) obj3d.htmlRow.addClass('selected');
			if(obj3d.isTemplate) obj3d.htmlRow.addClass('template');
			
			if(!obj3d.isAnchor) { 
				var h = $('<div class="row helper" alt="'+obj3d.uuid+'"></div>');
				obj3d.htmlRow.children('label:first').addClass('draggable').draggable({
					//axis:'y',
					appendTo:list,
					containment:list,
					scroll:false,
					delay:300,
					cursorAt: { left: 5, top: 5 },
					revert:'invalid',
					helper:function(){ return h[0]; },
					start:editScene.dragRowStarted,
					stop:editScene.dragRowStopped
				});
			}
			
			var prow = sceneRow;
			if(obj3d.parent != editScene.container){
				prow = $('#row-'+obj3d.parent.uuid, list);
			}
			prow.append(obj3d.htmlRow);
		});
		
		sceneRow.click(editScene.objectRowClicked);
		prevChildren.each(function(i,el){
			list.find('#'+el.id).addClass('collapsed').children('a.toggle:first').text('+');
		});
		
		list.disableSelection();
	},

	dragRowStarted:function(event, ui){
		var draggedObj = editScene.container.getObjectByUUID(ui.helper.attr('alt'),true);
		this.autoScrollTimer = setInterval(editScene.autoScrollScenePanel.bind(ui.helper), 300);
		
		// populate helper
		var draggedObjects = [];
		if(draggedObj.selected){
			draggedObjects = editScene.selectedObjects;
		} else {
			draggedObjects = [draggedObj];
		}
		ui.helper.empty();
		for(var i = draggedObjects.length - 1; i >= 0; i--){
			var obj3d = draggedObjects[i];
			if(obj3d.isAnchor) { draggedObjects.splice(i, 1); continue; }
			var color = editScene.automaticColorForIndex(obj3d.id, 1.0);
			var type = obj3d.isAnchor ? 'Anchor' : (obj3d.def ? obj3d.def.asset : '?');
			var h = $('<li><div class="tiny-swatch" style="background-color:'+color+'"/><label/></li>');
//				<span class="type">'+type+'</span></li>');
			h.children('label').text(draggedObjects[i].name);
			ui.helper.append(h);
		}
		//$(event.target).draggable('option','cursorAt',{left:Math.floor(ui.helper.width()*0.5), top:Math.floor(ui.helper.height()*0.5)});
		editScene.reparentObjects = draggedObjects;		
		
		// add droppable class to droppable rows
		$('#scene-list #scene,#scene-list #scene div.row').each(function(i, el){
			var uuid = el.id.substr(4);
			var obj = ((uuid == 'e') ? editScene.container : editScene.container.getObjectByUUID(uuid, true));
			var invalid = false;
			for(var i = 0; i < draggedObjects.length; i++){
				if(obj == draggedObjects[i] || obj.isDescendentOf(draggedObjects[i])){
					invalid = true;
					break;
				}
			}
			if(!invalid){
				var dd = $(el).children('div.droptarget');
				dd.addClass('droppable');
			}
		});
		
		$('#scene-list div.row > div.droptarget.droppable').droppable({
			accept: ".draggable",
			greedy: true,
			//activeClass: "ui-state-hover",
			hoverClass: "active",
			drop: function( event, ui ) {
				//console.log(event, ui);
				var targId = $(event.target).closest('.row').attr('id').substr(4);
				var obj = ((targId == 'e') ? editScene.container : editScene.container.getObjectByUUID(targId, true));
				editScene.reparentDraggedRowsTo(obj);
			}
		});
	},
	
	dragRowStopped:function(event, ui){
		editScene.rowDropTarget = null;
		$('#scene-list div.row > div.droptarget.droppable').removeClass('droppable').droppable('destroy');
		editScene.reparentObjects = null;
		
		if(this.autoScrollTimer) clearInterval(this.autoScrollTimer);
		this.autoScrollTimer = 0;
	},
	
	autoScrollScenePanel:function(){
		var list = $('#scene-list');
		var listHeight = list.height();
		var topOffs = list.offset();
		var rowOffs = this.offset();
		var top = rowOffs.top - topOffs.top;
		var p;
		if(top < 40){
			p = list.scrollTop() + (top - 40);
		} else if(top > listHeight - 40){
			p = list.scrollTop() + (top - (listHeight - 40));	
		}
		list.animate({ scrollTop:p }, 250);
	},
	
	objectRowClicked:function(e){
		// find object
		var targ = $(e.target);
		var row = targ.closest('.row');
		var rid = row.attr('id');
		var uuid = rid.substr(4);
		
		e.stopPropagation();
		
		if(targ.hasClass('toggle')){
			row.toggleClass('collapsed');
			var collapsed = false;
			if(row.hasClass('collapsed')){
				targ.text('+');
				collapsed = true;
			} else {
				targ.text('-');
			}
			
			// collapse all on the same level
			if(e.shiftKey){
				var sibs = row.siblings('.row');
				if(collapsed){
					sibs.addClass('collapsed').children('a.toggle').text('+');
				} else {
					sibs.removeClass('collapsed').children('a.toggle').text('-');
				}
				
			}
			return;			
		}
		
		if(rid == 'scene') return;
		
		// find object
		var object = editScene.container.getObjectByUUID(uuid);
		if(!(editScene.shift || editScene.ctrl || editScene.alt)){
			editScene.deselectAll();
			editScene.selectObject(object, true);
		}		
		else if(editScene.ctrl) editScene.selectObject(object, !object.selected);
		else if(editScene.alt) editScene.selectObject(object, false);
		else if(editScene.shift){
			var prevSib = row.prevAll('.row.selected:first');
			if(prevSib.length){
				// select up to this one
				var sibs = prevSib.nextUntil(row, '.row').add(row);
				sibs.each(function(i, el){
					var uuid = el.id.substr(4);
					var obj = editScene.container.getObjectByUUID(uuid);
					editScene.selectObject(obj, true);
				});
			} else {
				prevSib = row.nextAll('.row.selected:first');
				if(prevSib.length){
					var sibs = prevSib.prevUntil(row, '.row').add(row);
					sibs.each(function(i, el){
						var uuid = el.id.substr(4);
						var obj = editScene.container.getObjectByUUID(uuid);
						editScene.selectObject(obj, true);
					});
				} else {
					editScene.selectObject(object, true);
				}
			}
		}
		editScene.selectionChanged();
	},

	objectLabelClicked:function(e){
		var uuid = e.target.id;//.substr(4);
		var obj = editScene.container.getObjectByUUID(uuid);
		editScene.objectClicked(obj);
		editScene.selectionChanged();
	},
	
	objectClicked:function(object){
		if(object){
			if(this.shift) this.selectObject(object, true);
			else if(this.ctrl) this.selectObject(object, !object.selected);
			else if(this.alt) this.selectObject(object, false);
			else {
				this.deselectAll();
				this.selectObject(object, true);
			}
		} else this.deselectAll();
		editScene.selectionChanged();
	},

	deselectAll:function(){
		if(!this.container || this.objectPickMode) return;
		this.selectedObjects.length = 0;
		this.container.traverse(function(obj){ 
			obj.selected = false;
			if(obj.htmlLabel) obj.htmlLabel.removeClass('selected');
			if(obj.htmlRow) obj.htmlRow.removeClass('selected');
		});
	},
	
	selectObject:function(obj, select){
		// pick object mode
		if(this.objectPickMode){
			this.objectPickMode(obj);
			return;
		}
		
		obj.selected = select;
		var sp = this.selectedObjects.indexOf(obj);
		
		if(select && sp === -1) this.selectedObjects.push(obj);
		else if(!select && sp >= 0) this.selectedObjects.splice(sp, 1);
		
		if(obj.htmlLabel) { 
			if(select) 
				obj.htmlLabel.addClass('selected');
			else 
				obj.htmlLabel.removeClass('selected');
		}
		if(obj.htmlRow) { 
			if(select) 
				obj.htmlRow.addClass('selected');
			else 
				obj.htmlRow.removeClass('selected');
		}
	},
	
	selectionChanged:function(){
		// scroll last selected obj into view in scene panel
		if(this.selectedObjects.length){
			var lastObj = this.selectedObjects[this.selectedObjects.length - 1];
			var list = $('#scene-list');
			var listHeight = list.height();
			var topOffs = list.offset();
			if(lastObj.htmlRow){
				var rowOffs = lastObj.htmlRow.offset();
				var top = rowOffs.top - topOffs.top;
				var p;
				if(top < 0){
					p = list.scrollTop() + top;
				} else if(top > listHeight - 40){
					p = list.scrollTop() + (top - (listHeight - 40));
				}
				//console.log(p);
				list.animate({ scrollTop:p }, 250);
			}
		}
		
		// refresh props panel
		this.refreshProps();
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Assets panel */

	
	assetEdit:function(e){
		var row = $(e.target).closest('.row');
		var origAsset = assets.cache.get(row.prop('asset'));
		if(!origAsset){
			// alert("Asset "+row.prop('asset')+" hasn't been loaded.\nTODO: prompt to create new.");
			console.warn("Asset "+row.prop('asset')+" hasn't been loaded.\nTODO: prompt to create new.");
			return;
		}
		var asset = _.deepClone(origAsset.importedAsset, 100);
		console.log("Editing ",asset);
		if(chrome && chrome.storage){
			chrome.app.window.create('editor/editor.html', { 
				id: asset.name,
				outerBounds: {
			      width: Math.max(800, window.outerWidth),
			      height: Math.max(600, window.outerHeight)
			    }
			 }, function(win){
			 	if(!win.contentWindow.loadAsset){
			 		win.contentWindow.loadAsset = asset;
			 		win.contentWindow.sceneEditor = editScene;
			 	}
			 	win.focus();
			});
		} else {
			var win = window.open('editor.html', '_blank');
		 	win.loadAsset = asset;
		 	win.sceneEditor = editScene;
		 	win.focus();
		}
	},

	refreshAssets:function(){
		var prevSelected = $('#asset-list div.selected').attr('id');
		$('#asset-list').children().remove();

		var rows = [];
		var allAssets = {};
		// reset use counts
		for(var key in assets.cache.files){
			assets.cache.files[key].used = 0;
		}
		// traverse and count
		editScene.container.traverse(function(obj3d){
			if(obj3d.isPlaceholder){	
				if(!allAssets[obj3d.def.asset]) allAssets[obj3d.def.asset] = { used: 1, name:obj3d.def.asset, missing:true };
				else allAssets[obj3d.def.asset].used++;
			} else if(obj3d instanceof THREE.PointCloud){
				assets.cache.files[obj3d.geometry.data.name].used++;
			}
		});
		_.extend(allAssets, assets.cache.files);
		// traverse scene to update use counts
		for(var i in allAssets){
			var asset = allAssets[i];
			var id = asset.name.replace(/\W|\s+/g,'-');
			var color = this.automaticColorForIndex(rows.length, 1.0);
			if(asset.missing) color = '#333';
			var newRow = $('<div class="row" id="asset-row-'+id+'"><div class="tiny-swatch" style="background-color:'+color+'"/><label/><span class="used">used '+asset.used+'</span></div>');
			newRow.find('label').text(asset.name);
			newRow.prop('asset', asset.name);
			if(asset.missing) newRow.addClass('missing');
			if(newRow.attr('id') == prevSelected) newRow.addClass('selected');
			newRow.click(this.assetSelect.bind(this));
			newRow.dblclick(this.assetEdit.bind(this));
			rows.push(newRow);
		}
		
		rows.sort(function(a,b){
			if(a.name < b.name) return -1;
			if(a.name > b.name) return 1;
			return 0;
		});	
		
		if(rows.length) rows.push($('<hr/><div style="height:4em;"/>'));
		
		$('#asset-list').append(rows);
		
		if(prevSelected) $('#'+prevSelected).trigger('click');
	},

	assetSelect:function(e){
		var row = $(e.target).closest('.row');
		$('#asset-list .row').removeClass('selected');
		
		if(row.length){
			row = row.get(0);
			$(row).addClass('selected');
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Properties panel */

	refreshProps:function(){
		$('#editor-props > h1').text('Properties' + (this.selectedObjects.length ? (' ('+this.selectedObjects.length+')') : ''));
		$('#editor-props .panels > .panel').hide();
		if(!this.selectedObjects.length){
			$('#prop-name').attr('placeholder','Scene name').val(this.doc.name);
			$('#prop-object-type').text('Scene');
			$('#panel-scene').show();
			// scene panel
			$('#scene-color').css({backgroundColor: this.doc.clearColor.getHexString()});
			$('#scene-fog-color').css({backgroundColor: this.doc.fogColor.getHexString()});
			$('#scene-ambient-color').css({backgroundColor: this.doc.ambient.getHexString()});
			$('#scene-max-shadows').val(this.doc.maxShadows != undefined ? this.doc.maxShadows : 0).data('prevVal', $('#scene-max-shadows').val().toString());
			$('#scene-fog-near').val(this.doc.fogNear != undefined ? this.doc.fogNear : this.scene.fog.near).data('prevVal', $('#scene-fog-near').val().toString());
			$('#scene-fog-far').val(this.doc.fogFar != undefined ? this.doc.fogFar : this.scene.fog.far).data('prevVal', $('#scene-fog-far').val().toString());
			return;
		}
		$('#prop-name').attr('placeholder','Object name');
		$('#prop-object-type').text('');
		$('#panel-move').show();
		
		var prevObj = null;
		var mults = {};
		var containsAnchors = false;
		var containsSpotLights = false;
		var containsDirLights = false;
		var radToDeg = 180 / Math.PI;
		
		for(var i = 0; i < this.selectedObjects.length; i++){
			var obj = this.selectedObjects[i];
			// name
			if(prevObj && prevObj.name != obj.name){
				$('#prop-name').attr('placeholder','Multiple').val('');
				mults['name'] = true;
			} else if(!mults['name']){
				$('#prop-name').attr('placeholder','Object name').val(obj.name);
			}
			
			// excludes
			containsAnchors = containsAnchors || (!!obj.isAnchor);
			containsSpotLights = containsSpotLights | (obj instanceof THREE.SpotLight);
			containsDirLights = containsDirLights | (obj instanceof THREE.DirectionalLight);
			
			// type
			var type = (obj.isAnchor ? 'Anchor' : obj.def.asset);
			if(prevObj && (prevObj.isAnchor ? 'Anchor' : prevObj.def.asset) != type){
				$('#prop-object-type').text('Multiple types');
				mults['type'] = true;
			} else if(!mults['type']){
				$('#prop-object-type').text(type);
			}
			//x
			if(prevObj && prevObj.position.x != obj.position.x){
				$('#prop-x').attr('placeholder','M').val('').data('prevVal',''); mults['x'] = true;
			} else if(!mults['x']){
				$('#prop-x').attr('placeholder','').val(obj.position.x).data('prevVal', obj.position.x.toString());
			}
			//y
			if(prevObj && prevObj.position.y != obj.position.y){
				$('#prop-y').attr('placeholder','M').val('').data('prevVal',''); mults['y'] = true;
			} else if(!mults['x']){
				$('#prop-y').attr('placeholder','').val(obj.position.y).data('prevVal', obj.position.y.toString());
			}
			//z
			if(prevObj && prevObj.position.z != obj.position.z){
				$('#prop-z').attr('placeholder','M').val('').data('prevVal',''); mults['z'] = true;
			} else if(!mults['z']){
				$('#prop-z').attr('placeholder','').val(obj.position.z).data('prevVal', obj.position.z.toString());
			}
			//rx
			if(prevObj && prevObj.rotation.x != obj.rotation.x){
				$('#prop-rx').attr('placeholder','M').val('').data('prevVal',''); mults['rx'] = true;
			} else if(!mults['rx']){
				var newVal = Math.round(radToDeg * obj.rotation.x);
				$('#prop-rx').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			//ry
			if(prevObj && prevObj.rotation.y != obj.rotation.y){
				$('#prop-ry').attr('placeholder','M').val('').data('prevVal',''); mults['ry'] = true;
			} else if(!mults['ry']){
				var newVal = Math.round(radToDeg * obj.rotation.y);
				$('#prop-ry').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			//rz
			if(prevObj && prevObj.rotation.z != obj.rotation.z){
				$('#prop-rz').attr('placeholder','M').val('').data('prevVal',''); mults['rz'] = true;
			} else if(!mults['rz']){
				var newVal = Math.round(radToDeg * obj.rotation.z);
				$('#prop-rz').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			//sx
			if(prevObj && prevObj.scale.x != obj.scale.x){
				$('#prop-sx').attr('placeholder','M').val('').data('prevVal',''); mults['sx'] = true;
			} else if(!mults['sx']){
				var newVal = fake0(obj.scale.x);
				$('#prop-sx').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			//ry
			if(prevObj && prevObj.scale.y != obj.scale.y){
				$('#prop-sy').attr('placeholder','M').val('').data('prevVal',''); mults['sy'] = true;
			} else if(!mults['sy']){
				var newVal = fake0(obj.scale.y);
				$('#prop-sy').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			//rz
			if(prevObj && prevObj.scale.z != obj.scale.z){
				$('#prop-sz').attr('placeholder','M').val('').data('prevVal',''); mults['sz'] = true;
			} else if(!mults['sz']){
				var newVal = fake0(obj.scale.z);
				$('#prop-sz').attr('placeholder','').val(newVal).data('prevVal', newVal);
			}
			
			prevObj = obj;
		}
		
		// disable move
		if(containsAnchors){
			$('#panel-move input').attr('disabled','disabled').spinner('disable');
			$('#look-at,#prop-name').attr('disabled','disabled');
		} else {
			$('#panel-move input').removeAttr('disabled').spinner('enable');
			$('#look-at,#prop-name').removeAttr('disabled');
		}
		this.updateStoredPosition();
		
		// if(containsSpotLights || containsDirLights){ $('#look-at').attr('disabled', 'disabled'); }
	},
	
	positionSpinnerChange:function(e){
		var targ = $(e.target);
		var targId = e ? targ.attr('id') : null;
		
		// check if value actually changed
		var prevVal = targ.data('prevVal').toString();
		if(targ.val().toString() === prevVal) return;
		
		var newPos = new THREE.Vector3();
		newPos.set(null,null,null);
		var newVal = parseFloat(targ.spinner('value'));
		if(isNaN(newVal)) newVal = null;
		switch(targId){
		case 'prop-x':
			newPos.x = newVal;
			break;
		case 'prop-y':
			newPos.y = newVal;
			break;
		case 'prop-z':
			newPos.z = newVal;
			break;			
		}
		
		if(newPos.x === null && newPos.y === null && newPos.z === null) return;
		
		if(e.type == 'spinstop' && $(e.currentTarget).hasClass('ui-spinner-button') && prevVal == ''){
			editScene.moveSelectionBy(newPos);
			targ.attr('placeholder','M').val('');
		} else {
			editScene.moveSelectionTo(newPos);
			targ.attr('placeholder','');
		}

		targ.data('prevVal', targ.val());
	},

	rotationSpinnerChange:function(e){
		var targ = $(e.target);
		var targId = e ? targ.attr('id') : null;
		
		// check if value actually changed
		var prevVal = targ.data('prevVal').toString();
		if(targ.val().toString() === prevVal) return;
		
		var newPos = new THREE.Vector3();
		newPos.set(null,null,null);
		var newVal = parseFloat(targ.spinner('value'));
		if(isNaN(newVal)) newVal = null;
		switch(targId){
		case 'prop-rx':
			newPos.x = newVal;
			break;
		case 'prop-ry':
			newPos.y = newVal;
			break;
		case 'prop-rz':
			newPos.z = newVal;
			break;			
		}
		
		if(newPos.x === null && newPos.y === null && newPos.z === null) return;
		
		if(e.type == 'spinstop' && $(e.currentTarget).hasClass('ui-spinner-button') && prevVal == ''){
			editScene.rotateSelectionBy(newPos);
			targ.attr('placeholder','M').val('');
		} else {
			editScene.rotateSelectionTo(newPos);
			targ.attr('placeholder','');
		}

		targ.data('prevVal', targ.val());
	},
	
	scaleSpinnerChange:function(e){
		var targ = $(e.target);
		var targId = e ? targ.attr('id') : null;
		
		// check if value actually changed
		var prevVal = targ.data('prevVal').toString();
		if(targ.val().toString() === prevVal) return;
		
		var newPos = new THREE.Vector3();
		newPos.set(null,null,null);
		var newVal = parseFloat(targ.spinner('value'));
		if(isNaN(newVal)) newVal = null;
		switch(targId){
		case 'prop-sx':
			newPos.x = newVal;
			break;
		case 'prop-sy':
			newPos.y = newVal;
			break;
		case 'prop-sz':
			newPos.z = newVal;
			break;			
		}
		
		if(newPos.x === null && newPos.y === null && newPos.z === null) return;
		
		if(e.type == 'spinstop' && $(e.currentTarget).hasClass('ui-spinner-button') && prevVal == ''){
			editScene.scaleSelectionBy(newPos);
			targ.attr('placeholder','M').val('');
		} else {
			editScene.scaleSelectionTo(newPos);
			targ.attr('placeholder','');
		}

		targ.data('prevVal', targ.val());
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
			<li id="file-new">New Scene<em>Ctrl + N</em></li>\
			<hr/>\
			<li id="file-load">Import</li>\
			<li id="file-export">Export</li>\
			<hr/>\
			<li id="file-hold">Hold</li>\
			<li id="file-fetch">Fetch</li>\
			<hr/>\
			<li id="file-reset">Reset editor</li>\
		</ul>\
		<ul class="editor absolute-pos submenu shortcuts" id="edit-submenu">\
			<li id="edit-cut">Cut <em><span class="ctrl"/>X</em></li>\
			<li id="edit-copy">Copy <em><span class="ctrl"/>C</em></li>\
			<li id="edit-paste">Paste <em><span class="ctrl"/>V</em></li>\
			<hr/>\
			<li id="edit-delete">Delete selection <em>Delete</em></li>\
		</ul>\
		<ul class="editor absolute-pos submenu" id="view-submenu">\
			<li id="reset-zoom">Reset zoom</li>\
		</ul>\
		<div class="editor absolute-pos upper-right pad5" id="undo-buttons">\
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
		$('#file-load').click(editScene.loadDoc);
		$('#file-export').click(editScene.saveDoc);
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
		$('#edit-delete').click(this.deleteSelection.bind(this));
		$('#edit-copy').click(editScene.copySelection.bind(editScene));
		$('#edit-cut').click(editScene.cutSelection.bind(editScene));
		$('#edit-paste').click(editScene.pasteSelection.bind(editScene));
		
		// view menu
		$('#view').click(function(){
			$('.submenu').hide();
			var pos = $(this).offset();
			pos.top += $(this).height();
			$('#view-submenu').css(pos).show();
		});
		$('#reset-zoom').click(editScene.resetZoom.bind(editScene));
		$('#view-submenu').menu().hide();
		
	// help menu
		$('#help').click(editScene.showHelp);
	
	
	// properties
	$('body').append(
		'<div id="editor-props" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Properties</h1>\
		<hr/>\
		<div id="panel-common" class="panel">\
			<label for="prop-name" class="w2">Name</label><input type="text" size="10" id="prop-name"/>\
			<span id="prop-object-type">Nothing selected</span>\
		</div>\
		<div class="panels">\
			<div id="panel-move" class="panel"><h4>Object3D</h4>\
			<label for="prop-x" class="w0 right-align">X</label><input tabindex="0" type="text" class="center position" id="prop-x" size="1"/>\
			<label for="prop-rx" class="w1 right-align">Rot X</label><input tabindex="3" type="text" class="center rotation" id="prop-rx" size="1"/>\
			<label for="prop-sx" class="w1 right-align">Scale X</label><input tabindex="6" type="text" class="center scale" id="prop-sx" size="1"/><br/>\
			<label for="prop-y" class="w0 right-align">Y</label><input tabindex="1" type="text" class="center position" id="prop-y" size="1"/>\
			<label for="prop-ry" class="w1 right-align">Rot Y</label><input tabindex="4" type="text" class="center rotation" id="prop-ry" size="1"/>\
			<label for="prop-sy" class="w1 right-align">Scale Y</label><input tabindex="7" type="text" class="center scale" id="prop-sy" size="1"/><br/>\
			<label for="prop-z" class="w0 right-align">Z</label><input tabindex="2" type="text" class="center position" id="prop-z" size="1"/>\
			<label for="prop-rz" class="w1 right-align">Rot Z</label><input tabindex="5" type="text" class="center rotation" id="prop-rz" size="1"/>\
			<label for="prop-sz" class="w1 right-align">Scale Z</label><input tabindex="8" type="text" class="center scale" id="prop-sz" size="1"/><br/>\
			<div class="sub">Store <a id="store-pos">position</a> <a id="store-rot">rotation</a> <a id="store-scale">scale</a><span class="separator-left"/><a id="restore-pos" disabled="disabled">restore</a>\
			<span class="separator-left"/><a id="look-at">look at</a></div>\
			<div class="sub">Clear <a id="clear-pos">position</a> <a id="clear-rot">rotation</a> <a id="clear-scale">scale</a></div>\
			</div>\
		</div>\
		</div>');
		
		// common
		$('#prop-name').change(this.nameChanged.bind(this));
		
		// object3d
		$('#panel-move input.position').spinner({step:1, change:this.positionSpinnerChange, stop:this.positionSpinnerChange });//
		$('#panel-move input.rotation').spinner({step:5, change:this.rotationSpinnerChange, stop:this.rotationSpinnerChange});//
		$('#panel-move input.scale').spinner({step:0.25, change:this.scaleSpinnerChange, stop:this.scaleSpinnerChange});//
		$('#look-at').click(this.lookAtClicked);
		$('#store-pos').click(this.storePosition);
		$('#store-rot').click(this.storeRotation);
		$('#store-scale').click(this.storeScale);
		$('#clear-pos').click(this.clearStorePosition);
		$('#clear-rot').click(this.clearStoreRotation);
		$('#clear-scale').click(this.clearStoreScale);
		$('#restore-pos').click(this.restorePosition.bind(this));
		
		// scene panel
		$('#editor-props .panels').append('<div id="panel-scene" class="panel"><h4>Scene</h4>\
			<label for="scene-max-shadows" class="w32 pad5 right-align">Max shadows</label><input tabindex="3" type="text" class="center" id="scene-max-shadows" size="1"/><br/>\
			<label class="w32 right-align pad5">Clear color</label><div id="scene-color" class="color-swatch"/><br/>\
			<label class="w32 right-align pad5">Ambient</label><div id="scene-ambient-color" class="color-swatch"/><br/>\
			<label class="w32 right-align pad5">Fog color</label><div id="scene-fog-color" class="color-swatch"/><br/>\
			<label for="scene-fog-near" class="w32 pad5 right-align">Fog Near</label><input tabindex="1" type="text" class="center" id="scene-fog-near" size="2"/>\
			<label for="scene-fog-far" class="w1 pad5 right-align"> Far</label><input tabindex="2" type="text" class="center" id="scene-fog-far" size="2"/>\
			</div>');
		
		function valueChanged(setValueFunc){
			return function(e){
				var targ = $(e.target);
				// check if value actually changed
				var prevVal = targ.data('prevVal').toString();
				if(targ.val().toString() === prevVal) return;
				var newVal = parseInt(targ.spinner('value'));
				if(isNaN(newVal)) newVal = 0;
				setValueFunc.call(editScene, newVal);
				targ.data('prevVal', targ.val());
			}	
		};
		var vc = valueChanged(this.setSceneMaxShadows);
		$('#scene-max-shadows').spinner({step:1, change:vc, stop:vc});
		vc = valueChanged(this.setSceneFogNear);
		$('#scene-fog-near').spinner({step:10, change:vc, stop:vc});//
		vc = valueChanged(this.setSceneFogFar);
		$('#scene-fog-far').spinner({step:10, change:vc, stop:vc});//
		function colorPickerOnShow(dom){ 
			$(dom).css({zIndex: 1000});
			var src = $(this);
			var clr = new THREE.Color(src.css('background-color'));
			var hex = clr.getHexString();
			$(src).data('prevVal', hex);
			src.colpickSetColor(hex, true);
			
		};
		$('#scene-color').colpick({
			colorScheme:'dark',
			onShow:colorPickerOnShow,
			onHide:function(){ editScene.clearColor = editScene.doc.clearColor.getHex(); /* revert */ },
			onSubmit:function(hsb, hex, rgb, el){
				editScene.setSceneClearColor(hex);
				$(el).colpickHide();
			},
			onChange:function(hsb, hex, rgb, el){
				editScene.clearColor = parseInt(hex,16);				
			}
		});
		$('#scene-ambient-color').colpick({
			colorScheme:'dark',
			onShow:colorPickerOnShow,
			onHide:function(){ editScene.ambient.color.copy(editScene.doc.ambient); /* revert */ },
			onSubmit:function(hsb, hex, rgb, el){
				editScene.setSceneAmbientColor(hex);
				$(el).colpickHide();
			},
			onChange:function(hsb, hex, rgb, el){
				editScene.ambient.color.setHex(parseInt(hex,16));
			}
		});
		$('#scene-fog-color').colpick({
			colorScheme:'dark',
			onShow:colorPickerOnShow,
			onHide:function(){ editScene.scene.fog.color.copy(editScene.doc.fogColor); /* revert */ },
			onSubmit:function(hsb, hex, rgb, el){
				editScene.setSceneFogColor(hex);
				$(el).colpickHide();
			},
			onChange:function(hsb, hex, rgb, el){
				editScene.scene.fog.color.setHex(parseInt(hex,16));
			}
		});
		
		var savePosOnDrop = function(e, ui) { localStorage_setItem(ui.helper.context.id + '-x', ui.position.left); localStorage_setItem(ui.helper.context.id + '-y', ui.position.top); };
		var bringToFront = function(e, ui){ $('body').append(ui.helper.context); }
		function makeDraggablePanel(id, defX, defY, onResizeHandler){
			var panel = $('#'+id);
			var dw = panel.width();
			var dh = panel.height();
			panel.resizable({
				containment:"body",
				minHeight:200,
				minWidth:parseInt(panel.css('min-width')),
				maxWidth:parseInt(panel.css('min-width')),
				stop: function(e, ui){
					var h = ui.size.height;
					localStorage_setItem(ui.helper.context.id + '-height', h);
				},
				resize: onResizeHandler
			});
			var coll = localStorage_getItem(id+'-collapsed'); 
			if(coll === 'true') { 
				panel.addClass('collapsed').resizable('disable');
			} else {
				var h = parseInt(localStorage_getItem(id+'-height'));
				panel.css('height', h ? h : (window.innerHeight * 0.25));
			}
			if(onResizeHandler) onResizeHandler();
			var dx = localStorage_getItem(id+'-x');
			var dy = localStorage_getItem(id+'-y');
			dx = Math.min((dx === null) ? defX : dx, window.innerWidth - dw);
			dy = Math.min((dy === null) ? defY : dy, window.innerHeight - dh);
			panel.offset({left:dx, top: dy}).draggable({ snap: ".editor", containment: "body", cancel: '.ui-widget,input,a,button,#scene-list', start: bringToFront, stop: savePosOnDrop });
			panel.mousedown(function(){ $('.floating-panel').css({zIndex:100}); $(this).css({zIndex:101}); $('.submenu').hide();});
		}
		
	// scene
		$('body').append(
		'<div id="editor-scene" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Scene</h1>\
		<hr/>\
		<button id="scene-add">Add Object</button><!-- <button id="scene-dupe">Dupe</button><span class="separator-left"/>-->\
		<hr/>\
		<div id="scene-list"></div>\
		<hr/>\
		<button id="scene-delete">Delete</button>\
		</div>\
		<ul id="scene-add-menu" class="editor submenu absolute-pos">\
			<li id="scene-add-point-light">PixelBox asset</li><hr/>\
			<li id="scene-add-container">Object3D (Container)</li><hr/>\
			<li id="scene-add-point-light">Point Light</li>\
  		</ul>');
		$('#scene-add').button({icons:{secondary:'ui-icon-triangle-1-n'}}).click(function(){
		    $('#scene-add-menu').show().position({
	            at: "right top",
	            my: "right bottom",
	            of: this
	          });
          return false;
	    })
	    $('#scene-add-menu').hide().menu();
	    $('#scene-dupe').button();
	    $('#scene-delete').button().click(this.deleteSelection.bind(this));

	// assets
		$('body').append(
		'<div id="editor-assets" class="ui-widget-header ui-corner-all editor floating-panel">\
		<h1>Assets</h1>\
		<hr/>\
		<button id="asset-new">New</button><span class="separator-left"/>\
		<button id="asset-rename">Rename</button>\
		<hr/>\
		<div id="asset-list"></div>\
		<hr/>\
		<button id="asset-replace">Replace</button><span class="separator-left"/><button id="asset-delete">Delete</button>\
		</div>');
		$('#asset-new').button();
	    //$('#asset-rename').button().click(this.assetRename.bind(this));
	    //$('#asset-delete').button().click(this.assetDelete.bind(this));
	    
	    makeDraggablePanel('editor-scene', 20, window.innerHeight * 0.25, function(){
	    	var h = $('#editor-scene').height();
	    	$('#scene-list').css('height', h - 140);
	    });
   		makeDraggablePanel('editor-props', window.innerWidth - $('#editor-props').width() - 20, window.innerHeight * 0.25, function(){
	    	var h = $('#editor-props').height();
	    	$('#editor-props .panels').height(h - 100);
	    });
	    makeDraggablePanel('editor-assets', window.innerWidth - $('#editor-assets').width() - 20, $('#editor-props').offset().top + $('#editor-props').height() + 20, function(){
    		var h = $('#editor-assets').height();
    		$('#asset-list').css('height', h - 140);
	    });

	// replace shortcut text
		$('.editor .ctrl').append(navigator.appVersion.indexOf("Mac")!=-1 ? '&#8984; ':'Ctrl + ');//⌘
	
	// undo/redo
		$('#undo').button().click(this.performUndo.bind(this));
		$('#redo').button().click(this.performRedo.bind(this));
		
	// protect canvas when over UI
		$('.editor').hover(editScene.disableCanvasInteractions.bind(editScene),
							editScene.enableCanvasInteractions.bind(editScene));
		$("div").disableSelection();
		
	// add collapse buttons
		$('#editor-props,#editor-scene,#editor-assets').prepend('<a class="toggleCollapse">[-]</a>');
		$('.editor a.toggleCollapse').each(function(i, el){
			el = $(el);
			if(el.parent().hasClass('collapsed')) el.text('[+]'); 
		});
		$('.toggleCollapse').click(function(){
			var parent = $(this).parent();
			parent.toggleClass('collapsed');
			var collapsed = parent.hasClass('collapsed');
			$(this).text(collapsed ? '[+]' : '[-]');
			var dw = parent.width(), dh = parent.height();
			var pos = parent.offset();
			parent.offset({left:Math.min(pos.left, window.innerWidth - dw - 20),
							top: Math.min(pos.top, window.innerHeight - dh - 20)});
			var parentid = parent.get(0).id;
			if(collapsed){
				parent.resizable('disable');
				parent.css('height','');
			} else {
				parent.resizable('enable');
				parent.css('height', parseInt(localStorage_getItem(parentid+'-height')));
			}
			localStorage_setItem(parentid+'-collapsed', collapsed);
			parent.resizable('option','resize')();
		});
		
	// focus/blur
		$('input').on('focus',function(e){editScene.focusedTextField = e.target; editScene.disableKeyboardShortcuts();})
				  .on('blur',function(e){editScene.focusedTextField = null; editScene.enableKeyboardShortcuts();})
				  .on('keyup',function(e){ if(e.which == 13) e.target.blur(); });
		
		$(window).on('dragover', this.onDragFilesOver);
		$(window).on('dragleave', this.onDragFilesOver);
		$(window).on('drop', this.onDropFiles);
		
		this.enableCanvasInteractions(true);
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
			<em>Ctrl + N</em> create new<br/>\
			<em>Ctrl + S</em> hold<br/>\
			<em>Ctrl + E</em> export data<br/>\
			<br/>\
			<em><span class="ctrl"/>C</em> copy selection<br/>\
			<em><span class="ctrl"/>X</em> cut selection<br/>\
			<em><span class="ctrl"/>V</em> paste selection<br/>\
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
		if(this.controls.busy()) { 
			this.disableCanvasInteractionsOnRelease = true;
		} else {
			this.canvasInteractionsEnabled = false;
		}
		
		if(all === true){
			$(window).off('mouseup.editor mousedown.editor mousemove.editor');
			this.disableKeyboardShortcuts();
		}
	},
	
	enableCanvasInteractions:function(all){
		this.disableCanvasInteractionsOnRelease = false;
		this.canvasInteractionsEnabled = true;
		if(all === true){
			this.disableKeyboardShortcuts();
			this.enableKeyboardShortcuts();
			$(window).off('.editor');
			$(window).on('keydown.editor', this.keyDown.bind(this));
			$(window).on('keyup.editor', this.keyUp.bind(this));
			$(window).on('mouseup.editor', this.mouseUp.bind(this));
			$(window).on('mousemove.editor', this.mouseMove.bind(this));
			$(window).on('mousedown.editor', this.mouseDown.bind(this));
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Keyboard functions */

	enableKeyboardShortcuts:function(){
		//key('ctrl+n,⌘+n', function(){ editScene.newDoc(); return false; });
		key('ctrl+z,⌘+z', function(){ editScene.performUndo(); return false; });
		key('ctrl+shift+z,⌘+shift+z', function(){ editScene.performRedo(); return false; });
		//key('ctrl+shift+c,⌘+shift+c', function(){ editScene.frameRangeCopy({}); return false; });
		//key('ctrl+shift+v,⌘+shift+v', function(){ editScene.frameRangePaste({}); return false; });
		//key('ctrl+shift+x,⌘+shift+x', function(){ editScene.frameRangeCut({}); return false; });
		key('ctrl+c,⌘+c', function(){ editScene.copySelection(); return false; });
		key('ctrl+v,⌘+v', function(){ editScene.pasteSelection(); return false; });
		key('ctrl+x,⌘+x', function(){ editScene.cutSelection(); return false; });
		//key('escape', function(){ editScene.cancelPaste(); return false; });
		//key('ctrl+s,⌘+s', function(){ editScene.holdDoc(); return false; });
		//key('ctrl+e,⌘+e', function(){ editScene.saveDoc(); return false; });
	},

	disableKeyboardShortcuts:function(){
		//key.unbind('ctrl+n,⌘+n');
		key.unbind('ctrl+z,⌘+z');
		key.unbind('ctrl+shift+z,⌘+shift+z');
		key.unbind('ctrl+c,⌘+c');
		key.unbind('ctrl+x,⌘+x');
		key.unbind('ctrl+v,⌘+v');
		//key.unbind('ctrl+shift+c,⌘+shift+c');
		//key.unbind('ctrl+shift+x,⌘+shift+x');
		//key.unbind('ctrl+shift+v,⌘+shift+v');
		//key.unbind('escape');
		//key.unbind('ctrl+s,⌘+s');
		//key.unbind('ctrl+e,⌘+e');*/
	},

	/* shortcuts */
	keyUp:function(e){
		if(editScene.focusedTextField || (e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA'))) return;
	
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
	},
	
	keyDown:function(e){
		// process tabbing inside panels
		if(e.target && (e.target.tagName == 'INPUT' || e.target.tagName == 'TEXTAREA')){
			if (e.which == 9) {
	            e.preventDefault();
	            var targ = $(e.target);
	            var tabIndex = targ.attr('tabindex');
	            var siblings = [];
	            if(targ.hasClass('ui-spinner-input')){
		            siblings = targ.parent().parent().find(':tabbable'+(tabIndex != undefined ? '[tabindex]' : ''));
	            } else {
		            siblings = targ.parent().find(':tabbable'+(tabIndex != undefined ? '[tabindex]' : ''));
		        }
		        var index = siblings.index(targ);
		        if(index != -1){
		        	if(tabIndex != undefined){
		        		tabIndex = parseInt(tabIndex);
		        		if(e.shiftKey){
		        			tabIndex--;
		        			if(tabIndex < 0) tabIndex = siblings.length - 1;
		        		} else {
		        			tabIndex = (tabIndex + 1) % siblings.length;
		        		}
		        		siblings.filter('[tabindex='+tabIndex+']').focus().select();
		        	} else {
			        	if(e.shiftKey){
			        		index--;
			        		if(index < 0) index = siblings.length - 1;
			        	} else {
			        		index = (index + 1) % siblings.length;
			        	}
			        	siblings.eq(index).focus().select();
		        	}
		        }
	        }
	        return;
		}
		if(editScene.focusedTextField) return;
		
		e.preventDefault();
		e.stopPropagation();
		
		if($('.ui-dialog').length && e.which != 13) return;
		
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
			//editScene.maskPlaneStep(-1);
			break;
		case 221:// ]
			//editScene.maskPlaneStep(1);
			break;
		case 188:// <
			//editScene.currentFrame--;
			break;
		case 190:// >
			//editScene.currentFrame++;
			break;
		case 8: // del
		case 46: // back
			editScene.deleteSelection();
			break;
		case 187: // +
			//editScene.maskInflate(null, 1);
			break;
		case 189:// -
			//editScene.maskInflate(null, -1);
			break;
		case 13: // enter
			var btn = $('.ui-dialog .ui-dialog-buttonset button').first();
			if(btn.length) btn.trigger('click');
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
			break;
			
		case 27: // esc
			if(editScene.objectPickMode){
				editScene.objectPickMode(null);
			}
			break;
			
		default:
			console.log(e);
			break;
		}
	},

/* ------------------- ------------------- ------------------- ------------------- ------------------- Framework */

	/* initialize */
	init:function(){
		// defaults
		var bgc = localStorage_getItem('editor-scene-bg-color');
		this.clearColor = (bgc !== null ? parseInt(bgc,16) : 0x333333);	
		
		// setup scene
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.Fog(0x0, 1000, 10000);
		
		// ambient
		this.ambient = new THREE.AmbientLight(0x0);
		this.scene.add(this.ambient);

		// camera
		this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 2000000 );
		this.camera.position.set(512, 512, 512);
		this.camera.lookAt(0,0,0);
		this.scene.add(this.camera);
		this.controls = new THREE.EditorControls(this.camera, document.body);//renderer.webgl.domElement);
	    this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = true;
	    
   		// projector & mouse picker
		this.projector = new THREE.Projector();
		this.raycaster = new THREE.Raycaster( new THREE.Vector3(), new THREE.Vector3(), 0.01, this.camera.far ) ;
		this.projectorPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);

		// create render target
		var renderTargetParameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale,
												window.innerHeight * renderer.scale, renderTargetParameters );
					
		renderer.webgl.shadowMapEnabled = true;
		renderer.webgl.shadowMapSoft = true;
		renderer.webgl.shadowMapType = THREE.PCFSoftShadowMap;
		
		this.defaultSceneDef = {
			name:'newScene',
			maxShadows:2,
			clearColor:'333333',
			ambient:'000000',
			fogColor:'003399',
			fogNear:1000, fogFar:10000,
			layers:[
			{	"name": "camera",
				"asset": "Camera",
				"position": [0,50,100],
				"lookAt": [0,0,0]
			},
			{	"name": "sun",
				"asset": "DirectionalLight",
				"position": [0, 150, 0],
				"target": [0, 0, 0],
				"color": "FFFFFF",			
				"castShadow": true,
				"shadowBias": -0.00015,
				"intensity": 0.8,
				"shadowVolumeWidth": 256,
				"shadowVolumeHeight": 256,
				"shadowMapWidth": 1024
			},
			{	"name": "ambient",
				"asset": "HemisphereLight",
				"colors": ["2f62ff", "333399"],
				"position": [0, 170, 0],
				"intensity": 0.4
			}]
		};
		
		// fetch copy object
		try {
			this.sceneCopyItem = localStorage_getItem("sceneCopy");
			if(this.sceneCopyItem) this.sceneCopyItem = JSON.parse(this.sceneCopyItem);
		} catch(e){ console.log(e); }
	},
	
	/* callbacks */
	onWillAdd:function(){
		$(window).on('resize.editScene',this.onResized.bind(this));
	},		
	onAdded:function(){
		this.addUI();
		
		editScene.enableCanvasInteractions(true);
		
		document.addEventListener("contextmenu", function(e) {
			if(editScene.ctrl || e.ctrlKey){
				e.preventDefault();
				//editScene.mouseDown(e);
				//e.stopPropagation();
				$(e.target).trigger('click');
			}
			return false;
		}, false);
		
		// ready to display scene
		var data = localStorage_getItem('holdScene');
      	if(data){ 
      		this.newDocFromData(JSON.parse(data));
      	} else {
			this.newDoc(true, true);
		}
		this.resetZoom();
	},
	
	onWillRemove:function(){ 
		this.removeUI();
		$(window).off('.editor');
		editScene.disableKeyboardShortcuts();
	},
	onRemoved:function(){
		this.controls.panEnabled = this.controls.rotateEnabled = this.controls.zoomEnabled = false;
		$(window).off('.editor');
	},
	
	render:function( delta, rtt ) {
		renderer.webgl.setClearColor( this.clearColor, 1 );
		if (rtt) renderer.webgl.render( this.scene, this.camera, this.fbo, true );
		else renderer.webgl.render( this.scene, this.camera );
		
		this.updateTextLabels(this.container, 0);
	},
	
	onResized: function(e){
		if($(e.target).hasClass('floating-panel')) return;
		
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		var renderTargetParameters = { 
			minFilter: THREE.LinearFilter, 
			magFilter: THREE.LinearFilter, 
			format: THREE.RGBFormat, 
			stencilBuffer: false };
		this.fbo = new THREE.WebGLRenderTarget( window.innerWidth * renderer.scale, window.innerHeight * renderer.scale, renderTargetParameters );
		
		localStorage_setItem('windowWidth',window.outerWidth);
		localStorage_setItem('windowHeight',window.outerHeight);
    },
};

var editScene = new EditSceneScene();


/* scene serializing */

THREE.Object3D.prototype.serialize = function(templates){
	var def = {
		name: this.name
	};
	// common props
	var radToDeg = 180 / Math.PI;
	if(this.position.x || this.position.y || this.position.z) def.position = [this.position.x, this.position.y, this.position.z];
	if(this.rotation.x || this.rotation.y || this.rotation.z) def.rotation = [this.rotation.x * radToDeg, this.position.y * radToDeg, this.position.z * radToDeg];
	if(this.scale.x != 1.0 || this.scale.y != 1.0 || this.scale.z != 1.0) {
		if(this.scale.x != this.scale.y || this.scale.y != this.scale.z || this.scale.y != this.scale.x){
			def.scale = [this.position.x, this.position.y, this.position.z];
		} else {
			def.scale = this.scale.x;
		}
	}
	if(this.castShadow !== undefined) def.castShadow = this.castShadow;
	if(this.receiveShadow !== undefined) def.receiveShadow = this.receiveShadow;
	if(!this.visible) def.visible = false;
	if(this.children.length) def.layers = [];
	
	// types
	if(this instanceof THREE.Camera){
		def.asset = 'Camera';
		def.fov = this.fov;
		def.near = this.near;
		def.far = this.far;
	} else if(this instanceof THREE.DirectionalLight){
		def.asset = 'DirectionalLight';
		if(this.shadowCameraRight != 128) def.shadowVolumeWidth = this.shadowCameraRight * 2;
		if(this.shadowCameraTop != 128) def.shadowVolumeHeight = this.shadowCameraTop * 2;
		def.shadowBias = this.shadowBias;
		def.color = this.color.getHexString();
		def.intensity = this.intensity;
		def.shadowMapWidth = Math.max(this.shadowMapWidth, this.shadowMapHeight);
	}  else if(this instanceof THREE.SpotLight){
		def.asset = 'SpotLight';
		if(this.shadowCameraRight != 128) def.shadowVolumeWidth = this.shadowCameraRight * 2;
		if(this.shadowCameraTop != 128) def.shadowVolumeHeight = this.shadowCameraTop * 2;
		def.shadowBias = this.shadowBias;
		def.shadowMapWidth = Math.max(this.shadowMapWidth, this.shadowMapHeight);
		def.color = this.color.getHexString();
		def.intensity = this.intensity;
		def.distance = this.distance;
		def.exponent = this.exponent;
		def.angle = this.angle * radToDeg;
		if(this.target.isAnchor){
			def.target = this.target.name;
		} else {
			def.target = [this.target.position.x,this.target.position.y,this.target.position.z];
		}
	} else if(this instanceof THREE.PointLight){
		def.asset = 'PointLight';
		def.color = this.color.getHexString();
		def.intensity = this.intensity;
		def.distance = this.distance;
	
	} else if(this instanceof THREE.HemisphereLight){
		def.asset = 'HemisphereLight';
		def.colors = [this.color.getHexString(), this.groundColor.getHexString()];
		def.intensity = this.intensity;
	
	} else if(this instanceof THREE.Mesh){
		if(this.geometry instanceof THREE.PlaneBufferGeometry){
			def.asset = 'Plane';
		} // other types can be added later	
		
		def.color = this.material.color.getHexString();
		
	} else if(this.isContainer){
		def.asset = 'Object3D';
	
	} else if(this instanceof THREE.PointCloud || this.isPlaceholder){
		if(this.isPlaceholder){
			def.asset = this.def.asset;
			if(this.def.pointSize != undefined) def.pointSize = this.def.pointSize;
			if(this.def.alpha != undefined) def.alpha = this.def.alpha;
			if(this.def.cullBack != undefined) def.cullBack = this.def.cullBack;
			if(this.def.occlusion != undefined) def.occlusion = this.def.occlusion;
			if(this.def.tint != undefined) def.tint = this.def.tint;
			if(this.def.add != undefined) def.add = this.def.add;
			if(this.def.stipple != undefined) def.stipple = this.def.stipple;
			if(this.def.animSpeed != undefined) def.animSpeed = this.def.animSpeed;
			
			// process anchored children
			for(var i = 0; i < this.children.length; i++){
				// skip anchors
				var child = this.children[i];
				if(child.anchored) {
					var cdef = child.serialize(templates);
					if(child.isTemplate) {
						// TODO - TEMPLATES
					} else {
						cdef.anchor = child.anchored;
						def.layers.push(cdef);
					}
				}
			}
		} else {
			def.asset = this.geometry.data.name;
			def.pointSize = this.pointSize;
			if(this.alpha != 1.0) def.alpha = this.alpha;
			if(!this.cullBack) def.cullBack = true;
			if(this.occlusion != 1.0) def.occlusion = this.occlusion;
			if(this.tint.getHex() != 0xffffff) def.tint = this.tint.getHexString();
			if(this.addColor.getHex() != 0) def.add = this.addColor.getHexString();
			if(this.stipple) def.stipple = this.stipple;
			if(this.animSpeed != 1.0) def.animSpeed = this.animSpeed;
			
			// add anchored children
			for(var aname in this.anchors){
				var anchor = this.anchors[aname];
				for(var i = 0; i < anchor.children.length; i++){
					var child = anchor.children[i];
					child.anchored = aname;
					var cdef = child.serialize(templates);
					if(child.isTemplate) {
						// TODO - TEMPLATES
					} else {
						cdef.anchor = aname;
						def.layers.push(cdef);
					}				
				}
			}
		}
		if(this.def.gotoAndStop != undefined) def.gotoAndStop = this.def.gotoAndStop;
		if(this.def.loopAnim != undefined) def.loopAnim = this.def.loopAnim;
		if(this.def.loopFrom != undefined) def.loopFrom = this.def.loopFrom;
		if(this.def.playAnim != undefined) def.playAnim = this.def.playAnim;
		
	} else {
		console.log("Serializing an unknown type", this);
		def.asset = 'Object3D';
	}
	
	// process children
	for(var i = 0; i < this.children.length; i++){
		// skip anchors
		var child = this.children[i];
		if(child.isAnchor || child.anchored) continue;
		if(child.isTemplate) {
			// TODO - TEMPLATES
		} else {
			def.layers.push(child.serialize(templates));
		}
	}
	
	if(def.layers && !def.layers.length) delete def.layers;
	
	// update and return
	this.def = def;
	return def;
};

/* helper */
function fake0(v){ if(Math.abs(v) < 0.01) return 0; else return v; }
function not0(v){ if(Math.abs(v) < 0.01 || isNaN(v)) return 0.001; else return v; }
function notNaN(v){ if(isNaN(v)) return 0; else return v; }


/* called on document load */
function documentReady(){
	// init renderer
	if(!renderer.init()){
		var err = "Your browser doesn't support WebGL";
		alert(err);
		console.error(err);
		return;
	} else {
		console.log("WebGL initialized");
	}
	
	// init localstorage, then start
	localStorage_init(function(){
		editScene.init();
		renderer.setScene(editScene);
	});
}

/* global helper functions */
function localStorage_init(onReady) {
	if(chrome && chrome.storage){
		chrome.storage.local.get(null, function(obj){
			window.storageShadow = obj;
			onReady();
		});
	} else onReady();
}

function localStorage_setItem(key, val){
	if(chrome && chrome.storage){
		var kv = {};
		window.storageShadow[key] = kv[key] = val.toString();
		chrome.storage.local.set(kv);
	} else {
		localStorage.setItem(key, val);
	}
}

function localStorage_getItem(key){
	if(chrome && chrome.storage){
		return (window.storageShadow[key] !== undefined) ? window.storageShadow[key] : null;
	} else {
		return localStorage.getItem(key);
	}
	return null;
}

function localStorage_clear(){
	if(chrome && chrome.storage){
		chrome.storage.local.clear();
		window.storageShadow = {};
	} else {
		localStorage.clear();
	}
}

/* cookies */
function createCookie(name, value, days) {
    var expires;

    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    } else {
        expires = "";
    }
    document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = encodeURIComponent(name) + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

/* deep clone */
_.deepClone = function(obj, depth) {
	if (typeof obj !== 'object') return obj;
	if (obj === null) return null;
	if (_.isString(obj)) return obj.splice();
	if (_.isDate(obj)) return new Date(obj.getTime());
	if (_.isFunction(obj.clone)) return obj.clone();
	var clone = _.isArray(obj) ? obj.slice() : _.extend({}, obj);
	// clone array's extended props
	if(_.isArray(obj)){
	  for(var p in obj){
		  if(obj.hasOwnProperty(p) && _.isUndefined(clone[p]) && isNaN(p)){
			  clone[p] = obj[p];
		  }
	  }
	}
	if (!_.isUndefined(depth) && (depth > 0)) {
	  for (var key in clone) {
	    clone[key] = _.deepClone(clone[key], depth-1);
	  }
	}
	return clone;
};

$(document).ready(documentReady);
