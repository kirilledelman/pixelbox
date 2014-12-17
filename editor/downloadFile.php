<?php

// just bounce the data for download

header('Content-type: application/json');
header('Content-Disposition: attachment; filename='.$_POST['filename']);
header('Content-length: '.strlen($_POST['data']));

echo $_POST['data'];

?>