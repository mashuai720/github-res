
$(function () {

    $.get("http://8.222.189.135/script/mbtk.txt", function (data,status) {
        if("success" === status){
            mapboxgl.accessToken = data;
        }
    });
});