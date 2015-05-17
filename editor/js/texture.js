$( document ).ready( function() {

	if ( window.imageSrc ) {
		var img = new Image();

		img.src = window.imageSrc;

		$( document.body ).append( img );

		window.innerWidth = Math.max( 256, img.naturalWidth );
		window.innerHeight = Math.max( 256, img.naturalHeight );

		$( '#info' ).text( window.imageName + ' (' + img.naturalWidth + ' x ' + img.naturalHeight + ' )' );

	} else if ( window.assetString ) {

		$( document.body ).append( '<pre id="preview"/>');

		$( '#preview' ).text( typeof( window.assetString ) == 'string' ? window.assetString : JSON.stringify( window.assetString, null, '\t' ) );

		$( '#info' ).text( window.assetName );

	}

} );