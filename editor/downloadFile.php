<?php

// just bounce the data for download

if( !empty($_POST['type']) ) {
	header('Content-type: '.$_POST['type']);

	$_POST['data'] = base64_decode($_POST['data']);

} else {
	header('Content-type: application/json');
}
header('Content-Disposition: attachment; filename='.$_POST['filename']);
header('Content-length: '.strlen($_POST['data']));

echo $_POST['data'];

?>