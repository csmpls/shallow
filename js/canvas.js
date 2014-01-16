
if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var MARGIN = 100;

var SCREEN_WIDTH = window.innerWidth;
var SCREEN_HEIGHT = window.innerHeight - 2 * MARGIN;

var renderer, container, stats;

var camera, scene;
var cameraOrtho, sceneRenderTarget;

var uniformsNoise, uniformsNormal,
	heightMap, normalMap,
	quadTarget;

var spotLight, pointLight;

var terrain;
var particles;

var animDelta = 0, animDeltaDir = 1;
var lightVal = 0, lightDir = -1;
var soundVal = 0, oldSoundVal = 0, soundDir = 1;

var clock = new THREE.Clock();

// timing for cues (in s)
var sunrise_time = 70.0; var has_sunrise = false;
var sunset_time = 190.0; var has_sunset = false;
var birds_start = 0.0; var birds_end = 295.0; var has_birds = false; 

var morph, morphs = [];

var cued_morph, cued_morphs = [];

var updateNoise = true;

var animateTerrain = true;

var textMesh1;

var mlib = {};

init();
animate();

function init() {

	container = document.getElementById( 'container' );

	soundtrack = document.getElementById( "soundtrack" );

	// SCENE (RENDER TARGET)

	sceneRenderTarget = new THREE.Scene();

	cameraOrtho = new THREE.OrthographicCamera( SCREEN_WIDTH / - 2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_HEIGHT / - 2, -10000, 10000 );
	cameraOrtho.position.z = 100;

	sceneRenderTarget.add( cameraOrtho );

	// SCENE (FINAL)

	scene = new THREE.Scene();

	scene.fog = new THREE.Fog( 0x050505, 2000, 4000 );
	scene.fog.color.setHSV( 1.56, .22, .66 );

	camera = new THREE.PerspectiveCamera( 40, SCREEN_WIDTH / SCREEN_HEIGHT, 2, 4000 );
	camera.position.set( -1200, 900, 1200 );

	scene.add( camera );

	//controls.keys = [ 65, 83, 68 ];

	// LIGHTS

	scene.add( new THREE.AmbientLight( 0x111111) );

	spotLight = new THREE.SpotLight( 0xffffcc, 0.0);
	spotLight.position.set( 500, 2000, 0 );
	spotLight.castShadow = true;
	scene.add( spotLight );

	pointLight = new THREE.PointLight( 0x0044cc, .0 );
	pointLight.position.set( 0, 0, 0 );
	scene.add( pointLight );


	// HEIGHT + NORMAL MAPS

	var normalShader = THREE.ShaderExtras[ 'normalmap' ];

	var rx = 256, ry = 256;
	var pars = { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat };

	heightMap  = new THREE.WebGLRenderTarget( rx, ry, pars );
	normalMap = new THREE.WebGLRenderTarget( rx, ry, pars );

	uniformsNoise = {

		time:   { type: "f", value: 1.0 },
		scale:  { type: "v2", value: new THREE.Vector2( 1.5, 1.5 ) },
		offset: { type: "v2", value: new THREE.Vector2( 0, 0 ) }

	};

	uniformsNormal = THREE.UniformsUtils.clone( normalShader.uniforms );

	uniformsNormal.height.value = 0.05;
	uniformsNormal.resolution.value.set( rx, ry );
	uniformsNormal.heightMap.texture = heightMap;

	var vertexShader = document.getElementById( 'vertexShader' ).textContent;

	// TEXTURES

	var specularMap = new THREE.WebGLRenderTarget( 2048, 2048, pars );

	var diffuseTexture1 = THREE.ImageUtils.loadTexture( "textures/water-tex-better.png", null, function () {

		loadTextures();
		applyShader( THREE.ShaderExtras[ 'luminosity' ], diffuseTexture1, specularMap );

	} );
	var diffuseTexture2 = THREE.ImageUtils.loadTexture( "textures/grasslight-big.jpg", null, loadTextures );
	var detailTexture = THREE.ImageUtils.loadTexture( "textures/2_nm.png", null, loadTextures );

	diffuseTexture1.wrapS = diffuseTexture1.wrapT = THREE.RepeatWrapping;
	diffuseTexture2.wrapS = diffuseTexture2.wrapT = THREE.RepeatWrapping;
	detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
	specularMap.wrapS = specularMap.wrapT = THREE.RepeatWrapping;

	// TERRAIN SHADER

	var terrainShader = THREE.ShaderTerrain[ "terrain" ];

	uniformsTerrain = THREE.UniformsUtils.clone( terrainShader.uniforms );

	uniformsTerrain[ "tNormal" ].texture = normalMap;
	uniformsTerrain[ "uNormalScale" ].value = 3.5;

	uniformsTerrain[ "tDisplacement" ].texture = heightMap;

	uniformsTerrain[ "tDiffuse1" ].texture = diffuseTexture1;
	uniformsTerrain[ "tDiffuse2" ].texture = diffuseTexture2;
	uniformsTerrain[ "tSpecular" ].texture = specularMap;
	uniformsTerrain[ "tDetail" ].texture = detailTexture;

	uniformsTerrain[ "enableDiffuse1" ].value = true;
	uniformsTerrain[ "enableDiffuse2" ].value = true;
	uniformsTerrain[ "enableSpecular" ].value = true;

	uniformsTerrain[ "uDiffuseColor" ].value.setHex( 0xffffff );
	uniformsTerrain[ "uSpecularColor" ].value.setHex( 0xffffff );
	uniformsTerrain[ "uAmbientColor" ].value.setHex( 0x111188 );

	uniformsTerrain[ "uShininess" ].value = 50;

	uniformsTerrain[ "uDisplacementScale" ].value = 375;

	uniformsTerrain[ "uRepeatOverlay" ].value.set( 6, 6 );

	var params = [
					[ 'heightmap', 	document.getElementById( 'fragmentShaderNoise' ).textContent, 	vertexShader, uniformsNoise, false ],
					[ 'normal', 	normalShader.fragmentShader,  normalShader.vertexShader, uniformsNormal, false ],
					[ 'terrain', 	terrainShader.fragmentShader, terrainShader.vertexShader, uniformsTerrain, true ]
				 ];

	for( var i = 0; i < params.length; i ++ ) {

		material = new THREE.ShaderMaterial( {

			uniforms: 		params[ i ][ 3 ],
			vertexShader: 	params[ i ][ 2 ],
			fragmentShader: params[ i ][ 1 ],
			lights: 		params[ i ][ 4 ],
			fog: 			true
			} );

		mlib[ params[ i ][ 0 ] ] = material;

	}


	var plane = new THREE.PlaneGeometry( SCREEN_WIDTH, SCREEN_HEIGHT );

	quadTarget = new THREE.Mesh( plane, new THREE.MeshBasicMaterial( { color: 0xff0000, transparent: true } ) );
	quadTarget.position.z = -500;
	sceneRenderTarget.addObject( quadTarget );

	// TERRAIN MESH

	var geometryTerrain = new THREE.PlaneGeometry( 6000, 6000, 256, 256 );
	geometryTerrain.computeFaceNormals();
	geometryTerrain.computeVertexNormals();
	geometryTerrain.computeTangents();

	terrain = new THREE.Mesh( geometryTerrain, mlib[ "terrain" ] );
	terrain.rotation.set( -Math.PI/2, 0, 0 );
	terrain.position.set( 0, -125, 0 );
	terrain.visible = false;
	scene.add( terrain );


	// PARTICLES
	
	// particle system geometry
    var particles_geometry = new THREE.SphereGeometry( 700, 700, 20 );
    
    // vertex colors
    var particles_colors = [];

    for( var i = 0; i < particles_geometry.vertices.length; i++ ) {
    
        // random color
        particles_colors[i] = new THREE.Color();
        particles_colors[i].setHSV( Math.random(), 1.0, 1.0 );

    }
    particles_geometry.colors = particles_colors;

    // texture
    var particles_texture = new THREE.Texture( generateParticleTexture( ) );
    particles_texture.needsUpdate = true; // important

    // particle system material
    material = new THREE.ParticleBasicMaterial( {
        size: 20,
        map: particles_texture,
        blending: THREE.AdditiveBlending, // required
        depthTest: false, // required
        transparent: true,
        opacity: 0.7,
        vertexColors: true // optional
    } );

    // particle system
    particles = new THREE.ParticleSystem( particles_geometry, material );
    //particleSystem.sortParticles = true; // ???

    //scene.add( particles );


	// RENDERER

	renderer = new THREE.WebGLRenderer();
	renderer.setSize( SCREEN_WIDTH, SCREEN_HEIGHT );
	renderer.setClearColor( scene.fog.color, 1 );

	renderer.domElement.style.position = "absolute";
	renderer.domElement.style.top = MARGIN + "px";
	renderer.domElement.style.left = "0px";

	container.appendChild( renderer.domElement );

	//

	renderer.gammaInput = true;
	renderer.gammaOutput = true;


	// STATS

	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	container.appendChild( stats.domElement );

	stats.domElement.children[ 0 ].children[ 0 ].style.color = "#aaa";
	stats.domElement.children[ 0 ].style.background = "transparent";
	stats.domElement.children[ 0 ].children[ 1 ].style.display = "none";

	// EVENTS

	onWindowResize();

	window.addEventListener( 'resize', onWindowResize, false );

	document.addEventListener( 'keydown', onKeyDown, false );

	// COMPOSER

	renderer.autoClear = false;

	renderTargetParameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat, stencilBufer: false };
	renderTarget = new THREE.WebGLRenderTarget( SCREEN_WIDTH, SCREEN_HEIGHT, renderTargetParameters );

	effectBloom = new THREE.BloomPass( 0.6 );
	var effectBleach = new THREE.ShaderPass( THREE.ShaderExtras[ "bleachbypass" ] );

	hblur = new THREE.ShaderPass( THREE.ShaderExtras[ "horizontalTiltShift" ] );
	vblur = new THREE.ShaderPass( THREE.ShaderExtras[ "verticalTiltShift" ] );

	var bluriness = 6;

	hblur.uniforms[ 'h' ].value = bluriness / SCREEN_WIDTH;
	vblur.uniforms[ 'v' ].value = bluriness / SCREEN_HEIGHT;

	hblur.uniforms[ 'r' ].value = vblur.uniforms[ 'r' ].value = 0.5;

	effectBleach.uniforms[ 'opacity' ].value = 0.65;

	composer = new THREE.EffectComposer( renderer, renderTarget );

	var renderModel = new THREE.RenderPass( scene, camera );

	vblur.renderToScreen = true;

	composer = new THREE.EffectComposer( renderer, renderTarget );

	composer.addPass( renderModel );

	composer.addPass( effectBloom );
	composer.addPass( effectBleach );

	composer.addPass( hblur );
	composer.addPass( vblur );


	//CONTROLS
	controls = new THREE.TrackballControls( camera );
	controls.target.set( 0, 0, 0 );

	//controls.rotateSpeed = 1.0;
	//controls.zoomSpeed = 1.2;
	//controls.panSpeed = 0.8;

	controls.noZoom = false;
	controls.noPan = true;

	controls.staticMoving = false;
	controls.dynamicDampingFactor = 0.15;


	// MORPHS

	function addMorph( geometry, speed, duration, x, y, z ) {

		var material = new THREE.MeshLambertMaterial( { color: 0xffaa55, morphTargets: true, vertexColors: THREE.FaceColors } );

		var meshAnim = new THREE.MorphAnimMesh( geometry, material );

		meshAnim.speed = speed;
		meshAnim.duration = duration;
		meshAnim.time = 10000 * Math.random();

		meshAnim.position.set( x, y, z );
		meshAnim.rotation.y = Math.PI/2;

		meshAnim.castShadow = true;
		meshAnim.receiveShadow = false;

		scene.add( meshAnim );

		morphs.push( meshAnim );

		renderer.initWebGLObjects( scene );

	}


	function addCuedMorph( geometry, speed, duration, x, y, z ) {

		var material = new THREE.MeshLambertMaterial( { color: 0xffaa55, morphTargets: true, vertexColors: THREE.FaceColors } );

		var meshAnim = new THREE.MorphAnimMesh( geometry, material );

		meshAnim.speed = speed;
		meshAnim.duration = duration;
		meshAnim.time = 10000 * Math.random();

		meshAnim.position.set( x, y, z );
		meshAnim.rotation.y = Math.PI/2;

		meshAnim.castShadow = true;
		meshAnim.receiveShadow = false;

		scene.add( meshAnim );

		cued_morphs.push( meshAnim );

		renderer.initWebGLObjects( scene );

	}

	function morphColorsToFaceColors( geometry ) {

		if ( geometry.morphColors && geometry.morphColors.length ) {

			var colorMap = geometry.morphColors[ 0 ];

			for ( var i = 0; i < colorMap.colors.length; i ++ ) {

				geometry.faces[ i ].color = colorMap.colors[ i ];

			}

		}

	}

	var loader = new THREE.JSONLoader();

	var startX = -3000;

	// loader.load( "models/flamingo.js", function( geometry ) {

	// 	morphColorsToFaceColors( geometry );
	// 	addMorph( geometry, 250, 500, startX -500, 500, 700 );
	// 	addMorph( geometry, 220, 500, startX - Math.random() * 5000, 500, -200 );
	// 	addMorph( geometry, 250, 500, startX - Math.random() * 5000, 500, 200 );
	// 	addMorph( geometry, 260, 500, startX - Math.random() * 5000, 500, 1000 );

	// } );

	loader.load( "models/flamingo.js", function( geometry ) {

		morphColorsToFaceColors( geometry );

		for (var i = 0; i < 10; i++ ) {
			addCuedMorph( geometry, 301 - Math.random() * 100, 1000, startX - (i*700), 325 + Math.random() * 160, -1000 + (i*200) );
		}
		

	} );

	loader.load( "models/parrot.js", function( geometry ) {

		morphColorsToFaceColors( geometry );

		for (var i = 0; i < 10; i++ ) {
			addCuedMorph( geometry, 301 - Math.random() * 100, 1000, startX - (i*700), 325 + Math.random() * 160, -1000 + (i*200) );
		}

	} );

	// PRE-INIT

	renderer.initWebGLObjects( scene );

}

//

function onWindowResize( event ) {

	SCREEN_WIDTH = window.innerWidth;
	SCREEN_HEIGHT = window.innerHeight - 2 * MARGIN;

	renderer.setSize( SCREEN_WIDTH, SCREEN_HEIGHT );

	camera.aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
	camera.updateProjectionMatrix();

}

//

function getTimeInSong() {
	var songtime = document.getElementById( "soundtrack" ).currentTime;
	if (songtime)
		return songtime;
	return 0;
}

//

function onKeyDown ( event ) {

	switch( event.keyCode ) {

		case 78: /*N*/  lightDir *= -1; break;
		case 77: /*M*/  animDeltaDir *= -1; break;
		case 66: /*B*/  var songtime = console.log(getTimeInSong()); break;
		case 70: /*f*/  if( THREEx.FullScreen.activated() ){
				  THREEx.FullScreen.cancel();
				}else{
				  THREEx.FullScreen.request();
				} break;

	}

};

//

function applyShader( shader, texture, target ) {

	var shaderMaterial = new THREE.ShaderMaterial( {

		fragmentShader: shader.fragmentShader,
		vertexShader: shader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( shader.uniforms )

	} );

	shaderMaterial.uniforms[ "tDiffuse" ].texture = texture;

	var sceneTmp = new THREE.Scene();

	var meshTmp = new THREE.Mesh( new THREE.PlaneGeometry( SCREEN_WIDTH, SCREEN_HEIGHT ), shaderMaterial );
	meshTmp.position.z = -500;
	sceneTmp.add( meshTmp );

	renderer.render( sceneTmp, cameraOrtho, target, true );

};

//

function loadTextures() {


}

function startViz() {

	terrain.visible = true;

	document.getElementById( "ready" ).style.display = "none";

	document.getElementById( "soundtrack" ).play();


}

//

function animate() {

//	requestAnimationFrame( animate );

	setTimeout( function() {

        requestAnimationFrame( animate );

    }, 1000 / 18 );

	render();
	stats.update();



}

function render() {


	var delta = clock.getDelta();

	soundVal = THREE.Math.clamp( soundVal + delta * soundDir, 0, 1 );

	if ( soundVal !== oldSoundVal ) {

		if ( soundtrack ) {

			soundtrack.volume = soundVal;
			oldSoundVal = soundVal;

		}

	}

	// check for cues
	var ct = getTimeInSong();

	if (!has_sunrise) {
		if (ct > sunrise_time) {
			lightDir *= -1;
			has_sunrise = true;
		}
	}

	if (has_sunrise && !has_sunset) {
		if (ct > sunset_time) {
			console.log("sunset...");
			lightDir *= -1;
			has_sunset = true;
		}
	}

	if (!has_birds) {
		if (ct > birds_start && ct < birds_end) {
			console.log("birds starting");
			has_birds = true;
		}
	} if (has_birds) {
		if (ct > birds_end) {
			has_birds = false;
			console.log("birds ending");
		}
	}

	//rotate entire particle system

    particles.rotation.x += 0.0015;
    particles.rotation.y += 0.0005;



	
	if ( terrain.visible ) {

		controls.update();

		var time = Date.now() * 0.001;

		var fLow = 0.05; fHigh = 0.850;

		lightVal = THREE.Math.clamp( lightVal + 0.005 * delta * lightDir, fLow, fHigh );

		var valNorm = ( lightVal - fLow ) / ( fHigh - fLow );

		var sat = THREE.Math.mapLinear( valNorm, 0, 1, 0.46, 0.25 );
		scene.fog.color.setHSV( .156, sat, lightVal );

		renderer.setClearColor( scene.fog.color, 1 );

		spotLight.intensity = THREE.Math.mapLinear( valNorm, 0, 1, 0.1, 1.15 );
		pointLight.intensity = THREE.Math.mapLinear( valNorm, 0, 1, 0.9, 1.5 );

		uniformsTerrain[ "uNormalScale" ].value = THREE.Math.mapLinear( valNorm, 0, 1, 0.6, 3.5 );

		if ( updateNoise ) {

			animDelta = THREE.Math.clamp( animDelta + 0.00075 * animDeltaDir, 0, 0.05 );
			uniformsNoise[ "time" ].value += delta * animDelta;

			uniformsNoise[ "offset" ].value.x += delta * 0.05;

			uniformsTerrain[ "uOffset" ].value.x = 4 * uniformsNoise[ "offset" ].value.x;

			quadTarget.material = mlib[ "heightmap" ];
			renderer.render( sceneRenderTarget, cameraOrtho, heightMap, true );

			quadTarget.material = mlib[ "normal" ];
			renderer.render( sceneRenderTarget, cameraOrtho, normalMap, true );

			//updateNoise = false;

		}

		

		if (getTimeInSong() > birds_start) {

			// update the birds whom we've cued
			for ( var i = 0; i < cued_morphs.length; i ++ ) {

				cued_morph = cued_morphs[ i ];

				cued_morph.updateAnimation( 250 * delta );

				cued_morph.position.x += cued_morph.speed * delta;

				if ( cued_morph.position.x  > 2500 ) {

					if ( has_birds )

						cued_morph.position.x = -1500 - Math.random() * 1000;

					else if ( !has_birds && getTimeInSong() > birds_end)

						scene.remove(cued_morph);

				}

			}
		}


		// for ( var i = 0; i < morphs.length; i ++ ) {

		// 	morph = morphs[ i ];

		// 	morph.updateAnimation( 250 * delta );

		// 	morph.position.x += morph.speed * delta;

		// 	if ( morph.position.x  > 2500 )  {

		// 		morph.position.x = -1500 - Math.random() * 1000;

		// 	}


		// }

		//renderer.render( scene, camera );
		composer.render( 0.1 );



	}

}


function generateParticleTexture( ) {

    // draw a circle in the center of the canvas
    var size = 128;
    
    // create canvas
    var canvas = document.createElement( 'canvas' );
    canvas.width = size;
    canvas.height = size;
    
    // get context
    var context = canvas.getContext( '2d' );
    
    // draw circle
    var centerX = size / 2;
    var centerY = size / 2;
    var radius = size / 2;

    context.beginPath();
    context.arc( centerX, centerY, radius, 0, 2 * Math.PI, false );
    context.fillStyle = "#FFFFFF";
    context.fill();

    return canvas;

}
