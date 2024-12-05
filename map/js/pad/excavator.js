/**
 * 挖机操作js脚本
 *
 * @author 马帅
 * @since 2024-5-20 17:48:03
 */

let map,
    LASourceIdList = [],
    LALayerIdList = [],
    plannedRoadLineAnimation,
    websocket;
//rem自适配
let fs=document.documentElement.clientWidth;
fs>400?fs=400:fs;
document.getElementsByTagName('html')[0].style.fontSize=10*(fs/400)+'px';
let mesh;
//读取3d模型
let modelOrigin = [118.46, 44.82];
//let modelOrigin = [108.6535, 34.36];
const modelAltitude = 0;
let modelRotate = [Math.PI / 2,Math.PI , 0];

let modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
    modelOrigin,
    modelAltitude
);
let modelTransform = {
    translateX: modelAsMercatorCoordinate.x,
    translateY: modelAsMercatorCoordinate.y,
    translateZ: modelAsMercatorCoordinate.z,
    rotateX: modelRotate[0],
    rotateY: modelRotate[1],
    rotateZ: modelRotate[2],
    scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
};
//卡车全局变量
let CarArr=[];
let checkedLayer='';
let editFlag=false;
layui.use(['dtree', 'form', 'element'],function(){
    let dtree = layui.dtree,
        form = layui.form,
        element = layui.element;

    loadMap();

    // 监听下拉
    form.on('select(excavator-select-filter)', function(data){
        if(checkedLayer!==''&& editFlag){
            layer.confirm("切换挖机前，是否保存现有装料位？", {
                icon: 6,
                btn: ['确定', '取消']
            }, function(index){
                saveLayer(checkedLayer);
                layer.close(index)
            },function(index){
                layer.close(index)
                return;
            })
        }else{
            let excavatorId = data.value;
            if(isEmpty(excavatorId)){
                return false;
            }

            let excavatorNumber = this.innerHTML;
            let areaExcavatorPositionInfo = getAreaExcavatorPositionInfo(excavatorNumber);
            if(isEmpty(areaExcavatorPositionInfo)){
                layui.layer.msg("未查询到该挖机对应的装料区预设信息");
                return false;
            }
            let areaId = areaExcavatorPositionInfo.areaId;
            loadLALayersToMap(areaId);
        }



    });

    // 监听按钮点击事件
    $(document).on("click","button[data-id]", function(e){
        let did = $(this).attr("data-id");

        switch(did){
            case "refresh-excavator-position":
                let excavatorId = $("#excavatorNumber").val();
                if(isEmpty(excavatorId)){
                    $("#excavatorNumber").addClass("layui-form-danger").focus();
                    layui.layer.msg("请选择挖机编号", {icon: 5, anim: 6});
                    return false;
                }

                getExcavatorLoadingPositionInfo(excavatorId);
                break;

            case "reset-loading-area":
                if(checkedLayer && editFlag){
                    editFlag=false;
                    resetLayer(checkedLayer);
                }
                for(let i=0;i<=3;i++){
                    if(map.getLayer('chargingArea'+i)){
                        map.setPaintProperty('chargingArea'+i,'fill-color','#FFFF00');
                    }
                }
                removePlannedRoadLineLayers();
                break;
            case "excavator-activation":
                let actId=$('#chuckNumberId').val();
                $.myAjax.toSend({
                    url : "/command/send-start-command/"+actId,
                    type : "post",
                    success : function(res){
                        if(res.code === 200){
                            layer.alert(res.msg, {
                                icon: 6,
                                title: "系统提示",
                                btn: ['确认']
                            }, function (index) {
                                layer.close(index);
                            });
                        } else {
                            layer.alert(res.msg, {
                                icon: 5,
                                title: "系统提示",
                                btn: ['确认']
                            }, function (index) {
                                layer.close(index);
                            });
                        }
                    }
                });
                break;
            case "excavator-close-down":
                let cloId=$('#chuckNumberId').val();
                $.myAjax.toSend({
                    url : "/command/send-stop-command/"+cloId,
                    type : "post",
                    success : function(res){
                        if(res.code === 200){
                            layer.alert(res.msg, {
                                icon: 6,
                                title: "系统提示",
                                btn: ['确认']
                            }, function (index) {
                                layer.close(index);
                            });
                        } else {
                            layer.alert(res.msg, {
                                icon: 5,
                                title: "系统提示",
                                btn: ['确认']
                            }, function (index) {
                                layer.close(index);
                            });
                        }
                    }
                });
                break;
            default:

        }
    })

    // 提交
    form.on("submit(area_collect_form_save)",function(data){
        if(checkedLayer){
            editFlag=false;
            saveLayer(checkedLayer)
        }
        // 初始化卡车
        // let datas=[
        //     {
        //         "truckLicense": "W012",
        //         "type": "in",
        //         "geojson": {
        //             "type": "LineString",
        //             "coordinates": [
        //                 [
        //                     118.0,
        //                     44.1,
        //                     915
        //                 ],
        //                 [
        //                     118.1,
        //                     44.2,
        //                     915
        //                 ]
        //             ]
        //         }
        //     },
        //     {
        //         "truckLicense": "W013",
        //         "type": "out",
        //         "geojson": {
        //             "type": "LineString",
        //             "coordinates": [
        //                 [
        //                     118.1,
        //                     44.1,
        //                     915
        //                 ],
        //                 [
        //                     118.2,
        //                     44.2,
        //                     915
        //                 ]
        //             ]
        //         }
        //     }
        // ]
        let excavatorName=$('#excavatorNumber').val();
        let ids=$('#excavatorNumber').find('option[value="'+excavatorName+'"]').text();
        initSocket(ids)
        // $.myAjax.toSend({
        //     url : "/line/excavator/"+ids,
        //     type : "get",
        //     success : function(res){
        //         console.log(excavatorName)
        //         console.log(res)
        //         if(res.code === 200){
        //             layer.alert(res.msg, {
        //                 icon: 6,
        //                 title: "系统提示",
        //                 shade:0.6,
        //                 btn: ['确认']
        //             }, function (index) {
        //                 $.each(res.data,function(i,v){
        //                     initCar(v,ids)
        //                 });
        //                 layer.closeAll();
        //             });
        //         } else {
        //             layer.alert(res.msg, {
        //                 icon: 5,
        //                 title: "系统提示",
        //                 btn: ['确认']
        //             }, function (index) {
        //                 layer.closeAll();
        //             });
        //         }
        //     }
        // });
        return false;
    });

    const THREE = window.THREE;


    // map.on('style.load', () => {
    //     //map.addLayer(customLayer);
    //     map.addSource('point',{
    //         type:'geojson',
    //         data:{
    //             type:'FeatureCollection',
    //             features:[{
    //                 type:'Feature',
    //                 geometry:{
    //                     type:'Point',
    //                     coordinates:modelOrigin
    //                 }
    //             }]
    //         }
    //     })
    //     map.addLayer({
    //         id: 'point-layer',
    //         type: 'circle',
    //         source: 'point',
    //         paint:{
    //             "circle-color": "#ff0000"
    //         }
    //     });
    //
    //

    // });

    //挖机平移
    //装料区平移
    $('.layui-dig-move .layui-move-menu-content>i').on('click',function(e){
        let position=$(e.target).attr('move-id');
        let direction=parseFloat($('.layui-move-step input[type="number"]').val());
        if(checkedLayer){
            moveLayer(position,direction,checkedLayer)
        }
        //move(position,direction,mesh);
    })

    //挖机旋转
    //装料区旋转
    $('.layui-dig-angle .move-rotate>i').on('click',function(e){
        let position=$(e.target).attr('move-id');
        let angle=parseFloat($('.move-rotate input[type="number"]').val());
        if(checkedLayer){
            rotateLayer(position,angle,checkedLayer)
        }
        // rotate(position,angle,mesh);
    })
    //装料位旋转
    form.on('radio(chargingArea)', function(data){
        // let layer=map.getLayer('chargingPoint'+(data.value-1));
        for(let i=0;i<=3;i++){
            if(i==parseInt(data.value)-1){
                map.setPaintProperty('chargingArea'+(i),'fill-color','#ff0000');
                if((('chargingArea'+(i))!==checkedLayer) && checkedLayer!==''&& editFlag){
                    layer.confirm("切换装料位前，是否保存或重置现有装料位？", {
                        icon: 6,
                        btn: ['确定', '重置']
                    }, function(index){
                        saveLayer(checkedLayer);
                        checkedLayer='chargingArea'+(i);
                        layer.close(index)
                    },function(index){
                        resetLayer(checkedLayer);
                        checkedLayer='chargingArea'+(i);
                        layer.close(index)
                    })
                }else{
                    checkedLayer='chargingArea'+(i);
                }

            }else{
                map.setPaintProperty('chargingArea'+(i),'fill-color','#FFFF00');
            }
        }

    });

});
let a=0;
//保存
function saveLayer(selectlayer){
    let layer=map.getSource(selectlayer)._data.properties;

    let center= JSON.parse(layer.center).coordinates;
    let point=JSON.parse(layer.point_geojson).coordinates;
    let distance = turf.distance(center, point, {units: 'meters'});
    //提交信息弹窗
    layui.layer.open({
        type: 1,
        title:'调试参数信息',
        btn: ['确认提交', '取消'],
        btn1: function(index, layero, that){
            let loadIndex = layui.layer.msg('正在提交数据', {
                icon: 16,
                shade: 0.1,
                time: -1
            });

            $.myAjax.toSend({
                url : "/map/excavator",
                type : "put",
                data : {
                    id: $("#excavatorNumber").val(),
                    loadingPositionPointGeojson: layer.point_geojson,
                    loadingPositionBoxGeojson: layer.polygon_geojson,
                    loadingPositionCourseIn: layer.Angle,
                    loadingPosition: layer.loadingPosition,
                },
                success : function(res){

                    if(res.code === 200){
                        layui.layer.msg(res.msg, {
                            icon: 6,
                            title: "系统提示",
                            btn: ['确认']
                        }, function () {

                            let json = {
                                "layerType": 'chargingArea',
                                "point_geojson": layer.point_geojson,
                                "polygon_geojson":layer.polygon_geojson,
                                "old_point_geojson": layer.point_geojson,
                                "old_polygon_geojson": layer.polygon_geojson,
                                "index": layer.index,
                                "course": layer.course,
                                "current":layer.current,
                                "center":layer.center,
                                "Angle":layer.Angle,
                                "loadingPosition": layer.loadingPosition,
                            };
                            map.getSource("chargingArea" + layer.index).setData({
                                "type": "Feature",
                                "geometry": JSON.parse(layer.polygon_geojson),
                                "properties": json
                            })
                            editFlag=false;

                            // 回显规划路线
                            loadPlannedRoadLine(res.data);

                        });
                    } else {
                        layui.layer.msg(res.msg, {
                            icon: 5,
                            title: "系统提示",
                            btn: ['确认']
                        });
                    }
                    layui.layer.close(loadIndex);
                    layui.layer.close(index);
                }
            });
        },
        btn2: function(index, layero, that){
            layui.layer.close(index);
        },
        content: `<div style="padding: 16px;">
                    <table class="layui-table">
                      <colgroup>
                        <col width="150">
                        <col width="300">
                        <col>
                      </colgroup>
                      <thead>
                        <tr>
                          <th>信息名称</th>
                          <th>信息内容</th>
                        </tr> 
                      </thead>
                      <tbody>
                        <tr>
                          <td>裝料位倒车点坐标与航向</td>
                          <td>${point} | ${layer.Angle}</td>
                        </tr>
                        <tr>
                         <td>挖机中心点坐标与航向</td>
                         <td>${center} | ${layer.current}</td>
                        </tr>
                        <tr>
                          <td>挖机中心点至倒车点距离(米)</td>
                          <td>${distance}</td>
                        </tr>
                      </tbody>
                    </table>
                </div>`
    });
    return false;
}
//重置
function resetLayer(selectlayer){
    let layer=map.getSource(selectlayer)._data.properties;
    let centerPoint=turf.centroid(JSON.parse(layer.old_polygon_geojson));
    let arrPoint=turf.destination(JSON.parse(layer.old_point_geojson), -4,layer.course , {units: 'meters'});
    let arrLine=turf.lineString([arrPoint.geometry.coordinates,JSON.parse(layer.old_point_geojson).coordinates]);
    arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
    for(let i=0;i<=3;i++){
        if(map.getLayer('chargingArea'+i)){
            map.setPaintProperty('chargingArea'+i,'fill-color','#FFFF00');
        }
    }
    editFlag=false;
    let json={
        "layerType":'chargingArea',
        "point_geojson":layer.old_point_geojson,
        "polygon_geojson":layer.old_polygon_geojson,
        "old_point_geojson":layer.old_point_geojson,
        "old_polygon_geojson":layer.old_polygon_geojson,
        "index":layer.index,
        "center":layer.center,
        "current":layer.current,
        "course":layer.course,
        "Angle":layer.course,
        "loadingPosition": layer.loadingPosition,
    };
    map.getSource("chargingArea"+layer.index).setData({
        "type": "Feature",
        "geometry": JSON.parse(layer.old_polygon_geojson),
        "properties":json
    })
    map.getSource('chargingPoint'+layer.index).setData({
        "type": "Feature",
        "geometry":JSON.parse(layer.old_point_geojson),
    });
    map.getSource('centerPoint'+layer.index).setData({
        "type": "Feature",
        "geometry": centerPoint.geometry,
        "properties":{
            "title":layer.index+1
        }
    });
    map.getSource('centerLine'+layer.index).setData({
        "type": "Feature",
        "geometry": arrLine.geometry,
        "properties":{
            "title":layer.index+1
        }
    });
}
//3d模型平移
function move(position,direction,mesh){
    let bearing = map.getBearing();
    let angle=0;
    switch (position){
        case 'up':
            angle = 0 + bearing;
            break;
        case 'down':
            angle = 180 + bearing;
            break;
        case 'left':
            angle = 270 + bearing;
            break;
        case 'right':
            angle = 90 + bearing;
            break;
        default:
            break;
    }
    let newPoint = turf.transformTranslate(turf.point(modelOrigin),direction,angle, {
        units: 'meters',
        zTranslation: 0,
    });
    newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3});
    modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(newPoint.geometry.coordinates,0);
    modelTransform = {
        translateX: modelAsMercatorCoordinate.x,
        translateY: modelAsMercatorCoordinate.y,
        translateZ: modelAsMercatorCoordinate.z,
        rotateX: modelRotate[0],
        rotateY: modelRotate[1],
        rotateZ: modelRotate[2],
        scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
    };
    modelOrigin=newPoint.geometry.coordinates;
    map.addSource('pointa'+a,{
        type:'geojson',
        data:{
            type:'FeatureCollection',
            features:[{
                type:'Feature',
                geometry:{
                    type:'Point',
                    coordinates:newPoint.geometry.coordinates
                }
            }]
        }
    })
    map.addLayer({
        id: 'point-layer2'+a,
        type: 'circle',
        source: 'pointa'+a,
        paint:{
            "circle-color": "#ffff00"
        }
    });
    a++;
}
function moveLayer(position,direction,selectlayer){
    let bearing = map.getBearing();
    let layer=map.getSource(selectlayer)._data.properties;
    let newPoint,newPolygon,centerPoint,newCenterPoint,index,json,arrPoint,arrLine;
    let angle=0;
    editFlag=true;
    if(layer){
        switch (position){
            case 'up':
                angle = 180 +layer.course;
                newPoint = turf.transformTranslate(JSON.parse(layer.point_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                newPolygon = turf.transformTranslate(JSON.parse(layer.polygon_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                centerPoint=turf.centroid(JSON.parse(layer.polygon_geojson));
                newCenterPoint=turf.transformTranslate(centerPoint, direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3})
                newPolygon=turf.truncate(newPolygon,{precision: 7, coordinates: 3});
                newCenterPoint=turf.truncate(newCenterPoint,{precision: 7, coordinates: 3});
                index=layer.index;
                console.log(layer.polygon_geojson);
                json={
                    "layerType":'chargingArea',
                    "point_geojson":JSON.stringify(newPoint),
                    "polygon_geojson":JSON.stringify(newPolygon),
                    "old_point_geojson":layer.old_point_geojson,
                    "old_polygon_geojson":layer.old_polygon_geojson,
                    "index":index,
                    "center":layer.center,
                    "current":layer.current,
                    "course":layer.course,
                    "Angle":layer.Angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea"+index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties":json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newCenterPoint.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            case 'down':
                angle = 0 +layer.course;
                newPoint = turf.transformTranslate(JSON.parse(layer.point_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                newPolygon = turf.transformTranslate(JSON.parse(layer.polygon_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                centerPoint=turf.centroid(JSON.parse(layer.polygon_geojson));
                newCenterPoint=turf.transformTranslate(centerPoint, direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3})
                newPolygon=turf.truncate(newPolygon,{precision: 7, coordinates: 3});
                newCenterPoint=turf.truncate(newCenterPoint,{precision: 7, coordinates: 3});
                index=layer.index;
                console.log(layer.polygon_geojson);
                json={
                    "layerType":'chargingArea',
                    "point_geojson":JSON.stringify(newPoint),
                    "polygon_geojson":JSON.stringify(newPolygon),
                    "old_point_geojson":layer.old_point_geojson,
                    "old_polygon_geojson":layer.old_polygon_geojson,
                    "index":index,
                    "center":layer.center,
                    "current":layer.current,
                    "course":layer.course,
                    "Angle":layer.Angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea"+index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties":json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newCenterPoint.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            case 'left':
                angle = 90 + layer.course;
                newPoint = turf.transformTranslate(JSON.parse(layer.point_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                newPolygon = turf.transformTranslate(JSON.parse(layer.polygon_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                centerPoint=turf.centroid(JSON.parse(layer.polygon_geojson));
                newCenterPoint=turf.transformTranslate(centerPoint, direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3})
                newPolygon=turf.truncate(newPolygon,{precision: 7, coordinates: 3});
                newCenterPoint=turf.truncate(newCenterPoint,{precision: 7, coordinates: 3});
                index=layer.index;
                json={
                    "layerType":'chargingArea',
                    "point_geojson":JSON.stringify(newPoint),
                    "polygon_geojson":JSON.stringify(newPolygon),
                    "old_point_geojson":layer.old_point_geojson,
                    "old_polygon_geojson":layer.old_polygon_geojson,
                    "index":index,
                    "center":layer.center,
                    "current":layer.current,
                    "course":layer.course,
                    "Angle":layer.Angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea"+index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties":json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newCenterPoint.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            case 'right':
                angle = 270  +layer.course;
                newPoint = turf.transformTranslate(JSON.parse(layer.point_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                newPolygon = turf.transformTranslate(JSON.parse(layer.polygon_geojson), direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                centerPoint=turf.centroid(JSON.parse(layer.polygon_geojson));
                newCenterPoint=turf.transformTranslate(centerPoint, direction, angle, {
                    units: 'meters',
                    zTranslation: 0,
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3})
                newPolygon=turf.truncate(newPolygon,{precision: 7, coordinates: 3});
                newCenterPoint=turf.truncate(newCenterPoint,{precision: 7, coordinates: 3});
                index=layer.index;
                json={
                    "layerType":'chargingArea',
                    "point_geojson":JSON.stringify(newPoint),
                    "polygon_geojson":JSON.stringify(newPolygon),
                    "old_point_geojson":layer.old_point_geojson,
                    "old_polygon_geojson":layer.old_polygon_geojson,
                    "index":index,
                    "center":layer.center,
                    "current":layer.current,
                    "course":layer.course,
                    "Angle":layer.Angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea"+index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties":json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newCenterPoint.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            default:
                break;
        }
    }
}
function rotateLayer(position,ang,selectlayer){
    let bearing = map.getBearing();
    let layer=map.getSource(selectlayer)._data.properties;
    let angle = 0;
    let newPoint,newPolygon,centerPoint,index,json,arrLine,arrPoint;
    editFlag=true;
    if(layer){
        switch (position) {
            case 'zuozhuan':
                angle = -ang;
                centerPoint = turf.centroid(JSON.parse(layer.polygon_geojson));
                newPoint = turf.transformRotate(JSON.parse(layer.point_geojson), angle, {
                    pivot: centerPoint
                })
                newPolygon = turf.transformRotate(JSON.parse(layer.polygon_geojson), angle, {
                    pivot: centerPoint
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle+angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPoint=turf.truncate(newPoint,{precision: 7, coordinates: 3})
                newPolygon = turf.truncate(newPolygon, {precision: 7, coordinates: 3});
                newPoint = turf.truncate(newPoint, {precision: 7, coordinates: 3});
                index = layer.index;
                json = {
                    "layerType": 'chargingArea',
                    "point_geojson": JSON.stringify(newPoint),
                    "polygon_geojson": JSON.stringify(newPolygon),
                    "old_point_geojson": layer.old_point_geojson,
                    "old_polygon_geojson": layer.old_polygon_geojson,
                    "index": index,
                    "center":layer.center,
                    "current":layer.current,
                    "course": layer.course,
                    "Angle":layer.Angle+angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea" + index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties": json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            case 'youzhuan':
                angle = ang;
                centerPoint = turf.centroid(JSON.parse(layer.polygon_geojson));
                newPoint = turf.transformRotate(JSON.parse(layer.point_geojson), angle, {
                    pivot: centerPoint
                })
                newPolygon = turf.transformRotate(JSON.parse(layer.polygon_geojson), angle, {
                    pivot: centerPoint
                })
                arrPoint=turf.destination(newPoint, -4,layer.Angle+angle , {units: 'meters'});
                arrLine=turf.lineString([arrPoint.geometry.coordinates,newPoint.coordinates]);
                arrLine=turf.truncate(arrLine,{precision: 7, coordinates: 3});
                newPolygon = turf.truncate(newPolygon, {precision: 7, coordinates: 3});
                newPoint = turf.truncate(newPoint, {precision: 7, coordinates: 3});
                index = layer.index;
                json = {
                    "layerType": 'chargingArea',
                    "point_geojson": JSON.stringify(newPoint),
                    "polygon_geojson": JSON.stringify(newPolygon),
                    "old_point_geojson": layer.old_point_geojson,
                    "old_polygon_geojson": layer.old_polygon_geojson,
                    "index": index,
                    "current":layer.current,
                    "center":layer.center,
                    "course": layer.course,
                    "Angle":layer.Angle+angle,
                    "loadingPosition": layer.loadingPosition,
                };
                map.getSource("chargingArea" + index).setData({
                    "type": "Feature",
                    "geometry": newPolygon,
                    "properties": json
                })
                map.getSource('chargingPoint'+index).setData({
                    "type": "Feature",
                    "geometry": newPoint,
                });
                map.getSource('centerLine'+index).setData({
                    "type": "Feature",
                    "geometry": arrLine.geometry,
                    "properties":{
                        "title":index+1
                    }
                });
                break;
            default:
                break;
        }
    }
}
//3d模型旋转
function rotate(position,angle,mesh){
    let bearing = map.getBearing();
    let oldAngel= THREE.MathUtils.radToDeg (modelRotate[1]);
    switch (position){
        case 'zuozhuan':
            angle=angle;
            break;
        case 'youzhuan':
            angle=-angle;
            break;
    }
    modelRotate[1]=THREE.MathUtils.degToRad(oldAngel+angle);
    modelTransform = {
        translateX: modelAsMercatorCoordinate.x,
        translateY: modelAsMercatorCoordinate.y,
        translateZ: modelAsMercatorCoordinate.z,
        rotateX: modelRotate[0],
        rotateY: modelRotate[1],
        rotateZ: modelRotate[2],
        /* Since the 3D model is in real world meters, a scale transform needs to be
         * applied since the CustomLayerInterface expects units in MercatorCoordinates.
         */
        scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
    };
}
//初始化图层
function initLayer(map,data){
    // 设置初始参数
    let bearing = map.getBearing();
    let angel= data.w_current_course;
    let center= JSON.parse(data.w_center).coordinates;

    //初始化定位点
    if(!map.getSource("locationPoint")){
        map.addSource('locationPoint', {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": JSON.parse(data.w_center)
            }
        });
    } else {
        map.getSource("locationPoint").setData({
            "type": "Feature",
            "geometry": JSON.parse(data.w_center)
        });
    }
    if(!map.getLayer("locationPoint")){
        map.addLayer({
            "id": "locationPoint",
            "type": "circle",
            "source": "locationPoint",
            "paint": {
                "circle-color": "#ff0000"
            }
        });
    }
    //初始化定位采料位
    $.each(data.loading_poinstion,function(i,v){
        let centerPoint=turf.centroid(JSON.parse(v.polygon_geojson));
        let arrPoint=turf.destination(JSON.parse(v.point_geojson), -4,data.w_preset_course , {units: 'meters'});
        let centerLine=turf.lineString([arrPoint.geometry.coordinates,JSON.parse(v.point_geojson).coordinates]);
        if(!map.getSource("chargingArea"+i)){
            map.addSource('chargingArea'+i, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": JSON.parse(v.polygon_geojson),
                    "properties":{
                        "layerType":'chargingArea',
                        "point_geojson":v.point_geojson,
                        "old_point_geojson":v.point_geojson,
                        "polygon_geojson":v.polygon_geojson,
                        "old_polygon_geojson":v.polygon_geojson,
                        "index":i,
                        "center":data.w_center,
                        "current":data.w_current_course,
                        "course":data.w_preset_course,
                        "Angle":data.w_preset_course,
                        "loadingPosition": (i==0 || i==2) ? "L" : "R",
                    }
                }
            });
            map.addSource('chargingPoint'+i, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": JSON.parse(v.point_geojson),
                }
            });
            map.addSource('centerPoint'+i, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": centerPoint.geometry,
                    "properties":{
                        "title":i+1
                    }
                }
            });
            map.addSource('centerLine'+i, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": centerLine.geometry,
                    "properties":{
                        "title":i+1
                    }
                }
            });
        } else {
            map.getSource("chargingArea"+i).setData({
                "type": "Feature",
                "geometry": JSON.parse(v.polygon_geojson),
                "properties":{
                    "layerType":'chargingArea',
                    "point_geojson":v.point_geojson,
                    "polygon_geojson":v.polygon_geojson,
                    "index":i,
                    "course":data.w_preset_course
                }
            });
        }
        if(!map.getLayer("chargingArea"+i)){
            map.addLayer({
                "id": "chargingArea"+i,
                "type": "fill",
                "source": "chargingArea"+i,
                "paint": {
                    "fill-color": "#FFFF00",
                    "fill-opacity": 0.2,
                    "fill-outline-color":"#ff0000",
                }
            });
            map.addLayer({
                "id": "chargingPoint"+i,
                "type": "circle",
                "source": "chargingPoint"+i,
                "paint": {
                    "circle-color": "#FF0000",
                }
            });
            map.addLayer({
                "id": "centerLine"+i,
                "type": "line",
                "source": "centerLine"+i,
                "paint": {
                    "line-color": "#ffff00",
                    "line-width": 4,
                    "line-opacity": 0.8
                }
            });
            map.addLayer({
                "id": "centerLineArrow"+i,
                "type": "symbol",
                "source": "centerLine"+i,
                "layout": {
                    "visibility": "visible",
                    'symbol-placement': 'line',
                    'symbol-spacing': 120,
                    'icon-image': 'arrowIcon',
                    'icon-size': 1.2,
                }
            });
            map.addLayer({
                "id": "centerPoint"+i,
                "type": "symbol",
                "source": "centerPoint"+i,
                "layout": {
                    'text-field': '{title}',
                    'text-size': 16,
                    // "symbol-placement":"center",
                    "text-rotation-alignment":"viewport",
                    "text-pitch-alignment":"viewport",
                    // "text-variable-anchor": "center",
                    "text-ignore-placement": true,
                    "text-optional": true
                },
                "paint": {
                    "text-color": "#000000",
                    'text-halo-color': '#fff',
                    'text-halo-width': 2
                }
            });
        }else{
            map.setPaintProperty("chargingArea"+i,"fill-color","#FFFF00");
            map.setPaintProperty("chargingArea"+i,"fill-outline-color","#ff0000")
        }
    });
    //设置装料位互动
    map.on('click',function(e){
        var bbox = [
            [e.point.x - 1, e.point.y - 1],
            [e.point.x + 1, e.point.y + 1]
        ];
        let features = map.queryRenderedFeatures(bbox);
        if(features.length==0) return
        $.each(features,function(i,v){
            if(v.hasOwnProperty('properties') && v.properties.layerType=="chargingArea"){
                map.setPaintProperty(v.layer.id,'fill-color','#ff0000');
                for(let i=0;i<=3;i++){
                    if(v.layer.id!==('chargingArea'+i)){
                        map.setPaintProperty('chargingArea'+i,'fill-color','#FFFF00');
                        $('input[name="chargingArea"][value="'+(i+1)+'"]').removeAttr('checked');
                    }else{
                        $('input[name="chargingArea"][value="'+(i+1)+'"]').prop('checked',true);
                        if((checkedLayer!==v.layer.id) && checkedLayer!=='' && editFlag){
                            layer.confirm("切换装料位前，是否保存或重置现有装料位？", {
                                icon: 6,
                                btn: ['确定', '重置']
                            }, function(index){
                                saveLayer(checkedLayer);
                                checkedLayer='chargingArea'+(i);
                                layer.close(index)
                            },function(index){
                                resetLayer(checkedLayer);
                                checkedLayer='chargingArea'+(i);
                                layer.close(index)
                            })
                        }else{
                            checkedLayer='chargingArea'+i;
                        }
                    }
                }
                layui.form.render('radio');
                console.log(v.layer)
            }
        })

    })
    //设置航向
    let coursePoint=turf.rhumbDestination(turf.point(center), 10, angel, {units:'meters'});
    let courseLine=turf.lineString([[center[0],center[1]], turf.truncate(coursePoint,{precision: 7, coordinates: 3}).geometry.coordinates]);
    // if(!map.getSource("courseLine")){
    //     map.addSource('courseLine', {
    //         "type": "geojson",
    //         "data":courseLine
    //     });
    // } else {
    //     map.getSource("courseLine").setData(courseLine);
    // }
    // if(!map.getLayer("courseLine")){
    //     map.addLayer({
    //         "id": "courseLine",
    //         "type": "line",
    //         "source": "courseLine",
    //         "paint": {
    //             "line-color": "#ff0000"
    //         }
    //     });
    // }

    //初始化底座圆
    if(!map.getSource("baseCircle")){
        map.addSource('baseCircle', {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": JSON.parse(data.chainCirle)
            }
        });
    } else {
        map.getSource("baseCircle").setData({
            "type": "Feature",
            "geometry": JSON.parse(data.chainCirle)
        });
    }
    if(!map.getLayer("baseCircle")){
        map.addLayer({
            "id": "baseCircle",
            //"type": "fill",
            "type": "line",
            "source": "baseCircle",
            "paint": {
                /*"fill-color": "#ff0000",
                "fill-opacity": 0.5*/
                "line-color": "#ff0000",
                "line-opacity": 1,
                "line-width": 3
            }
        });
    }
    // //初始化范围圆
    if(!map.getSource("digCircle")){
        map.addSource('digCircle', {
            "type": "geojson",
            "data": {
                "type": "Feature",
                "geometry": JSON.parse(data.maxDiggingCircle)
            }
        });
    } else {
        map.getSource("digCircle").setData({
            "type": "Feature",
            "geometry": JSON.parse(data.maxDiggingCircle)
        });
    }
    if(!map.getLayer("digCircle")){
        map.addLayer({
            "id": "digCircle",
            //"type": "fill",
            "type": "line",
            "source": "digCircle",
            "paint": {
                /*"fill-color": "#26f800",
                "fill-opacity": 0.2*/
                "line-color": "#26f800",
                "line-opacity": 1,
                "line-width": 3
            }
        });
    }
    //初始化模型大小
    // let rect= getRectLatLngHandler(JSON.parse(data.w_center).coordinates)
    // map.addSource('rect',{
    //     type:'geojson',
    //     data:{
    //         type:'FeatureCollection',
    //         features:[rect]
    //     }
    // })
    // map.addLayer({
    //     id: 'rect-layer',
    //     type: 'line',
    //     source: 'rect',
    //     paint:{
    //         "line-color": "#ff0000",
    //     }
    // });
}
/**
 * 获取挖机装料位信息，返回挖机4个装料位位数据（定位点，框，航向）
 *
 * @param excavatorId 挖机ID
 */
function getExcavatorLoadingPositionInfo(excavatorId){
    $.myAjax.toSend({
        url : "/map/excavator/getExcavatorLoadingPositionInfo/" + excavatorId,
        type : "get",
        success : function(res){
            if(res.code === 200){
                console.log(res);
                //清空挖机选项
                $('input[name="chargingArea"]').removeAttr('checked');
                layui.form.render();
                initParma(res.data);
                initLayer(map,res.data);
            } else {
                layui.layer.msg(res.msg, {
                    icon: 5,
                    title: "系统提示",
                    btn: ['确认']
                });
            }
        }
    });
}
//初始化参数
function initParma(data){
    editFlag=false;
    checkedLayer='';
    let bearing=map.getBearing();
    modelOrigin =JSON.parse(data.w_center).coordinates;
    //modelRotate[1]=Math.PI-THREE.MathUtils.degToRad(data.w_current_course+data.w_preset_course+bearing);
    modelRotate[1]=Math.PI-THREE.MathUtils.degToRad(data.w_current_course);
    //挖机垂直
    // modelRotate[1]=Math.PI;
    modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
        modelOrigin,
        modelAltitude
    );
    modelTransform = {
        translateX: modelAsMercatorCoordinate.x,
        translateY: modelAsMercatorCoordinate.y,
        translateZ: modelAsMercatorCoordinate.z,
        rotateX: modelRotate[0],
        rotateY: modelRotate[1],
        rotateZ: modelRotate[2],
        scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
    };
    //TODO 如果存在模型可以直接修改位置
    if(map.getLayer('3d-model')){
        // map.removeLayer('3d-model');
    }
    let customLayer = {
        id: '3d-model',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            this.camera = new THREE.Camera();
            this.scene = new THREE.Scene();
            // create two three.js lights to illuminate the model
            const directionalLight = new THREE.DirectionalLight(0xffffff);
            directionalLight.position.set(0, -70, 100).normalize();
            this.scene.add(directionalLight);

            const directionalLight2 = new THREE.DirectionalLight(0xffffff);
            directionalLight2.position.set(0, 70, 100).normalize();
            this.scene.add(directionalLight2);

            const loader = new THREE.GLTFLoader();
            loader.load(
                '/uploadFile/model/excavator.glb',
                (glb) => {
                    //调整模型大小
                    glb.scene.scale.set(1.5,1.5,1.5);
                    //模型旋转
                    glb.scene.rotateY(THREE.MathUtils.degToRad(-0))
                    //模型上下左右移动
                    mesh=glb.scene;
                    //设置模型初始角度
                    this.scene.add(glb.scene);
                    console.log(glb.scene)
                }
            );
            this.map = map;

            this.renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true
            });

            this.renderer.autoClear = false;
        }, render: function (gl, matrix) {
            const rotationX = new THREE.Matrix4().makeRotationAxis(
                new THREE.Vector3(1, 0, 0),
                modelTransform.rotateX
            );
            const rotationY = new THREE.Matrix4().makeRotationAxis(
                new THREE.Vector3(0, 1, 0),
                modelTransform.rotateY
            );
            const rotationZ = new THREE.Matrix4().makeRotationAxis(
                new THREE.Vector3(0, 0, 1),
                modelTransform.rotateZ
            );

            const m = new THREE.Matrix4().fromArray(matrix);
            const l = new THREE.Matrix4()
                .makeTranslation(
                    modelTransform.translateX,
                    modelTransform.translateY,
                    modelTransform.translateZ
                )
                .scale(
                    new THREE.Vector3(
                        modelTransform.scale,
                        -modelTransform.scale,
                        modelTransform.scale
                    )
                )
                .multiply(rotationX)
                .multiply(rotationY)
                .multiply(rotationZ);

            this.camera.projectionMatrix = m.multiply(l);
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
            this.map.triggerRepaint();
        }
    };
    map.addLayer(customLayer);

    let zoom = map.getZoom();
    map.setBearing(data.w_preset_course > 180 ? data.w_preset_course - 180 : data.w_preset_course + 180);
    flyToLayer(JSON.parse(data.w_center), 20);
}
//初始化卡车
// function initCar(data,ids){
//     //初始化卡车路线
//     let is_Car=CarArr.findIndex(item => item.id === data.truckLicense);
//
//     if(is_Car==-1){
//         //初始化卡车模型
//
//     }else{
//         CarArr[is_Car]['carLineId_'+data.type]=carLineId
//     }
//     initSocket(ids);
// }

//初始化websocket
function initSocket(ids){
    let host = window.location.host;
    if('WebSocket' in window){
        // if(！websocket){
        websocket = new WebSocket("ws://"+ host +"/socket/" + ids);
        // }

    }else{
        alert('当前浏览器不支持 websocket')
        websocket.close();
    }


    websocket.onerror = function(){
        console.error("WebSocket连接发生错误");
    };

    websocket.onopen = function(event){
        console.log("WebSocket连接成功:" + event.target.url);
    };

    websocket.onmessage = function(event){
        console.log('接收：'+ event.data);
        let jsonData = JSON.parse(event.data);
        if(jsonData.type==='point'){
            MoveCar(jsonData.data);
        }else if(jsonData.type==='LineString'){
            createLine(jsonData.data)
        }else{
            console.log('noData')
        }
        //
        // console.log(jsonData)
    };

    websocket.onclose = function(){
        console.log("WebSocket连接关闭");
    };

    // 监听窗口关闭事件，当窗口关闭时，主动去关闭websocket连接，防止连接还没断开就关闭窗口，server端会抛异常。
    window.onbeforeunload = function(){
        websocket.close();
    };

    // 发送消息
    function send(){
        websocket.send("halo.....");
    }
}
//删除卡车
function removeCar(id){
    //删除路线
    if(map.getSource('carLine_'+id)){
        map.removeLayer('carLine_'+id)
        map.removeSource('carLine_'+id)
    }
}
//多路线生成
function createLine(data){
    let carLineId='carLine_'+data.type;
    if(data.geojson.coordinates.length==0){
        layer.confirm(data.truckLicense+"局部规划路线失败！", {
            icon: 6,
            btn: ['确定']
        }, function(index){
            layer.close(index)
            return;
        })
    }else{
        if (!map.getSource(carLineId)) {
            map.addSource(carLineId, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": data.geojson
                },
            });
        } else {
            map.getSource(carLineId).setData({
                "type": "Feature",
                "geometry": data.geojson
            });
        }
        if (!map.getLayer(carLineId)) {
            map.addLayer({
                'id': carLineId,
                'source': carLineId,
                'type': 'line',
                "layout": {
                    "visibility": "visible",
                    'line-cap': 'round',
                    'line-join': 'round'
                },
                "paint": {
                    "line-color": "#ff0000",
                    "line-width": [
                        "interpolate", ["linear"], ["zoom"],
                        13, 1,
                        22, 7
                    ]
                }
            });
        }
    }
}
//多卡车移动
function MoveCar(data){
    //初始化卡车
    let is_Car=CarArr.findIndex(item => item.id === data.truckLicense);


    if(is_Car!==-1){
        let truckType=data.truckCurrentState.split('')[1];
        let is_remove=false;
        CarArr.map(function(item){
            if(item.id==data.truckLicense){
                item.type!==truckType?is_remove=true:false;
            }
        })
        if(is_remove && data.truckCurrentState!=='THF'){
            if(map.getLayer('3d-model-'+data.truckLicense)){
                map.removeLayer('3d-model-'+data.truckLicense)

            }
            CarArr = CarArr.filter(item => item.id !== data.truckLicense);
            is_Car=-1
        }
    }
    if(is_Car==-1){
        if(data.truckCurrentState=='THF'){
            return
        }
        let bearing=map.getBearing();
        let carModelOrigin =data.truckCurrentPointGeojson.coordinates;
        let carModelRotate = [Math.PI / 2,Math.PI , 0];
        let carModelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
            carModelOrigin,
            0
        );
        carModelRotate[1]=Math.PI-THREE.MathUtils.degToRad(data.course?data.course:0);
        let obj={
            id:data.truckLicense,
            type:data.truckCurrentState.split('')[1],
            CarModelTransform:{
                translateX: carModelAsMercatorCoordinate.x,
                translateY: carModelAsMercatorCoordinate.y,
                translateZ: carModelAsMercatorCoordinate.z,
                rotateX: carModelRotate[0],
                rotateY: carModelRotate[1],
                rotateZ: carModelRotate[2],
                scale: carModelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
            }
        }
        // obj['carLineId_'+data.type]=carLineId;
        CarArr.push(obj)
        if(map.getLayer('3d-model')){
            // map.removeLayer('3d-model');
        }
        console.log('3d-model-'+data.truckLicense)
        let customLayer = {
            id: '3d-model-'+data.truckLicense,
            type: 'custom',
            renderingMode: '3d',
            onAdd: function (map, gl) {
                this.camera = new THREE.Camera();
                this.scene = new THREE.Scene();
                // create two three.js lights to illuminate the model
                const directionalLight = new THREE.DirectionalLight(0xffffff);
                directionalLight.position.set(0, -70, 100).normalize();
                this.scene.add(directionalLight);

                const directionalLight2 = new THREE.DirectionalLight(0xffffff);
                directionalLight2.position.set(0, 70, 100).normalize();
                this.scene.add(directionalLight2);

                const loader = new THREE.GLTFLoader();

                loader.load(
                    obj.type==='H'?'/uploadFile/model/tongli_truck_H.glb':'/uploadFile/model/tongli_truck_E.glb',
                    // '/map/lib/three/wajueji(1).glb',
                    // '/uploadFile/model/tongli_truck_H.glb',
                    // '/uploadFile/model/tongli_truck_E.glb',
                    // 'https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf',
                    (glb) => {
                        //调整模型大小
                        glb.scene.scale.set(150,150,150);
                        //模型旋转
                        glb.scene.rotateY(THREE.MathUtils.degToRad(-0))
                        //模型上下左右移动
                        mesh=glb.scene;
                        //设置模型初始角度
                        this.scene.add(glb.scene);
                        console.log(glb.scene)
                    }
                );
                this.map = map;

                this.renderer = new THREE.WebGLRenderer({
                    canvas: map.getCanvas(),
                    context: gl,
                    antialias: true
                });

                this.renderer.autoClear = false;
            }, render: function (gl, matrix) {
                const rotationX = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(1, 0, 0),
                    obj.CarModelTransform.rotateX
                );
                const rotationY = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(0, 1, 0),
                    obj.CarModelTransform.rotateY
                );
                const rotationZ = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(0, 0, 1),
                    obj.CarModelTransform.rotateZ
                );

                const m = new THREE.Matrix4().fromArray(matrix);
                const l = new THREE.Matrix4()
                    .makeTranslation(
                        obj.CarModelTransform.translateX,
                        obj.CarModelTransform.translateY,
                        obj.CarModelTransform.translateZ
                    )
                    .scale(
                        new THREE.Vector3(
                            obj.CarModelTransform.scale,
                            -obj.CarModelTransform.scale,
                            obj.CarModelTransform.scale
                        )
                    )
                    .multiply(rotationX)
                    .multiply(rotationY)
                    .multiply(rotationZ);

                this.camera.projectionMatrix = m.multiply(l);
                this.renderer.resetState();
                this.renderer.render(this.scene, this.camera);
                this.map.triggerRepaint();
            }
        };
        map.addLayer(customLayer);
    }else{
        if(data.truckCurrentState=='THF'){
            //删除3d模型
            if(map.getLayer('3d-model-'+data.truckLicense)){
                map.removeLayer('3d-model-'+data.truckLicense)
                CarArr = CarArr.filter(item => item.id !== data.truckLicense);
            }
        }else{
            let newPoint=turf.truncate(data.truckCurrentPointGeojson,{precision: 7, coordinates: 3});
            let newRotate=  [Math.PI / 2,Math.PI , 0];

            newRotate[1]=THREE.MathUtils.degToRad(data.course);
            CarArr.map(function(item){
                if(item.id==data.truckLicense){
                    item.modelUrl=data.truckCurrentState.split('')[1]==='H'?'/uploadFile/model/tongli_truck_H.glb':'/uploadFile/model/tongli_truck_E.glb',
                    item.CarModelTransform={
                        translateX: mapboxgl.MercatorCoordinate.fromLngLat(newPoint.coordinates,0).x,
                        translateY: mapboxgl.MercatorCoordinate.fromLngLat(newPoint.coordinates,0).y,
                        translateZ: mapboxgl.MercatorCoordinate.fromLngLat(newPoint.coordinates,0).z,
                        rotateX: newRotate[0],
                        rotateY: newRotate[1],
                        rotateZ: newRotate[2],
                        scale: mapboxgl.MercatorCoordinate.fromLngLat(newPoint.coordinates,0).meterInMercatorCoordinateUnits()
                    }
                }
            });
        }
    }
}
function getRectLatLngHandler(latlng) {
    const rectWidth = 4 / 2 // 矩形宽度
    const rectHeight = 6 / 2 // 矩形高度
    const center = latlng
    const maxRadius = rectWidth
    const minRadius = rectHeight
    const options = {
        steps: 4,
        units: 'meters',
        modelAsMercatorCoordinate
    }
    // eslint-disable-next-line no-undef
    const maxCircle = turf.circle(center, maxRadius, options)
    // eslint-disable-next-line no-undef
    const minCircle = turf.circle(center, minRadius, options)
    const leftLon = maxCircle.geometry.coordinates[0][1][0]
    const rightLon = maxCircle.geometry.coordinates[0][3][0]
    const topLat = minCircle.geometry.coordinates[0][0][1]
    const bottomLat = minCircle.geometry.coordinates[0][2][1]
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [
                [
                    [leftLon, topLat],
                    [rightLon, topLat],
                    [rightLon, bottomLat],
                    [leftLon, bottomLat],
                    [leftLon, topLat],
                ],
            ],
        },
    }
}
/**
 * 获取区域挖机预设位置信息
 *
 * @param excavatorNumber 挖机真实编号
 * @return {*} 包含区域ID
 */
function getAreaExcavatorPositionInfo(excavatorNumber) {
    if(isEmpty(excavatorNumber)){
        return;
    }
    let res = $.myAjax.toSendResult({
        url : "/map/areaExcavatorPosition/getByRealExcavatorNumber/" + excavatorNumber,
    });

    if(res.code === 200){
        return res.data;
    }
}
/**
 * 获取区域所有数据信息
 *
 * @param areaId
 * @return {*}
 */
function getAreaInfo(areaId) {
    if(isEmpty(areaId)){
        layui.layer.msg("装料区ID未知");
        return;
    }
    let res = $.myAjax.toSendResult({
        url : "/map/area/info/" + areaId,
    });

    if(res.code === 200){
        return res.data;
    }
}
/**
 * 加载装料区所有图层：采集路线、采集停车位置
 */
function loadLALayersToMap(areaId) {
    if(isEmpty(areaId)){
        return;
    }

    // 装料区域信息
    let areaInfo = getAreaInfo(areaId);
    if(isEmpty(areaInfo)){
        layui.layer.msg("没有区域数据");
        return false;
    }

    for (let i = 0; i < LALayerIdList.length; i++) {
        if(map.getLayer(LALayerIdList[i]+'_text')){
            map.removeLayer(LALayerIdList[i]+'_text');
        }
        if(map.getLayer(LALayerIdList[i]+'_icon')){
            map.removeLayer(LALayerIdList[i]+'_icon');
        }
        if(map.getLayer(LALayerIdList[i])){
            map.removeLayer(LALayerIdList[i]);
        }
        if(map.getSource(LALayerIdList[i])){
            map.removeSource(LALayerIdList[i]);
        }
    }

    let id = areaInfo.id;
    let name = areaInfo.name;
    let layerId = "area_" + id;

    $("#pad_excavator_area_name").append("：" + name);

    if(isNotEmpty(areaInfo.geojson)){
        let geojson = JSON.parse(areaInfo.geojson);
        // 区域范围，后期使用GEOJSON加载
        if(!map.getSource(layerId)){
            map.addSource(layerId, {
                "type": "geojson",
                "data": {
                    "type": "Feature",
                    "geometry": geojson
                },
                "maxzoom": 22
            });
            LASourceIdList.push(layerId);
        }
        if(!map.getLayer(layerId)){
            map.addLayer({
                "id": layerId,
                'source': layerId,
                //'source-layer': "polygon",
                "type": "fill",
                "minzoom": 13,
                "maxzoom": 22,
                "layout": {
                    "visibility": "visible",
                },
                "paint": {
                    "fill-color": 'rgba(124,235,14,0.23)',
                    "fill-outline-color": 'rgb(255,0,0)',
                    "fill-opacity": 0.5
                }
            });
            LALayerIdList.push(layerId);
        }
    }


    // 装料区采集路线，使用瓦片加载
    /*let areaRoadLineList = areaInfo.areaRoadLineList;
    if(isNotEmpty(areaRoadLineList)){
        if(!map.hasImage("arrowIcon")){
            let arrowIcon = new Image(10, 10)
            arrowIcon.src = "/map/img/arrow-icon.svg";
            arrowIcon.onload = function() {
                map.addImage('arrowIcon', arrowIcon);
            }
        }

        let paint;
        for (let i = 0; i < areaRoadLineList.length; i++) {
            let areaRoadLine = areaRoadLineList[i];
            let id = areaRoadLine.id;
            let name = areaRoadLine.roadLineType;
            let layerId = "areaRoadLine_" + id;
            areaRoadLineArr.push(layerId);
            if(!map.getSource(layerId)){
                let tiles_href = window.location.origin + "/map/areaCollectRoadLine/getTiles/" + id + "/{z}/{x}/{y}.mvt";
                map.addSource(layerId, {
                    type: 'vector',
                    tiles:[tiles_href],
                    bounds: [118.42295002114071, 44.7882842153993, 118.51215205073385, 44.85348501891053],
                    minzoom: 13,
                    maxzoom: 22,
                    attribution: ""
                });
                //LASourceIdList.push(layerId);
            }

            if(!map.getLayer(layerId)){
                paint = isEmpty(areaRoadLine.style) ? {
                    //"line-color": "#ff0000",
                    "line-color": randomColor(),
                    "line-width": [
                        "interpolate", ["linear"], ["zoom"],
                        15, 3,
                        22, 5
                    ]
                } : JSON.parse(areaRoadLine.style);

                map.addLayer({
                    'id': layerId,
                    'source': layerId,
                    'source-layer': "line",
                    'type': 'line',
                    "layout": {
                        "visibility": "visible",
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    "paint": paint
                });
                LALayerIdList.push(layerId);
                // 线图标
                map.addLayer({
                    'id': layerId + "_icon",
                    'source': layerId,
                    'source-layer': "line",
                    'type': 'symbol',
                    "minzoom": 13,
                    "maxzoom": 22,
                    'layout': {
                        "visibility": "visible",
                        'symbol-placement': 'line',
                        'symbol-spacing': 120,
                        'icon-image': 'arrowIcon',
                        'icon-size': 1,
                        //'icon-rotate': 90,
                    }
                });
                LALayerIdList.push(layerId + "_icon");
                // 线文本
                map.addLayer({
                    "id": layerId + "_text",
                    'source': layerId,
                    'source-layer': "line",
                    "type": "symbol",
                    "minzoom": 13,
                    "maxzoom": 22,
                    "layout": {
                        "visibility": "visible",
                        'symbol-placement': 'line-center',
                        "text-field": name,
                        "text-size": 12,
                        "text-rotation-alignment": "viewport",
                        "text-pitch-alignment": "viewport",
                    },
                    paint: {
                        "text-opacity": 1,
                        "text-color": "#ffffff",
                        "text-halo-color": "#36b368",
                        "text-halo-width": 100,
                        "text-halo-blur": 0,
                    }
                });
                LALayerIdList.push(layerId + "_text");
            }
        }
    }*/

    // 装料区点位，使用GEOJSON加载
    let areaNodeList = areaInfo.areaNodeList;
    if(isNotEmpty(areaNodeList)){
        for (let i = 0; i < areaNodeList.length; i++) {
            let id = areaNodeList[i].id;
            let name = areaNodeList[i].name;
            let layerId = "areaNode" + id;
            let geojson = JSON.parse(areaNodeList[i].pointGeojson);
            if(!map.getSource(layerId)){
                map.addSource(layerId, {
                    "type": "geojson",
                    "data": {
                        "type": "Feature",
                        "geometry": geojson
                    },
                    maxzoom: 22
                });
                LASourceIdList.push(layerId);
            }
            if(!map.getLayer(layerId)){
                map.addLayer({
                    "id": layerId,
                    'source': layerId,
                    //'source-layer': "point",
                    "type": "circle",
                    "minzoom": 15,
                    "layout": {
                        "visibility": "visible",
                    },
                    "paint": {
                        // make circles larger as the user zooms from z12 to z22
                        'circle-radius': {
                            'base': 1.75,
                            'stops': [[13, 5], [22, 8]]
                        },
                        //'circle-radius':20,
                        "circle-color": "#21e318"
                    }
                });
                LALayerIdList.push(layerId);
                map.addLayer({
                    "id": layerId + "_text",
                    'source': layerId,
                    //'source-layer': "point",
                    "type": "symbol",
                    "minzoom": 13,
                    "maxzoom": 22,
                    "layout": {
                        "visibility": "visible",
                        'symbol-placement': 'point',
                        "text-field": name,
                        "text-size": 14,
                        "text-rotation-alignment": "viewport",
                        "text-pitch-alignment": "viewport",
                    },
                    paint: {
                        "text-opacity": 1,
                        "text-color": "#ffffff",
                        "text-halo-color": "#36b368",
                        "text-halo-width": 200,
                        "text-halo-blur": 200,
                        "text-translate": [15, 0],
                    }
                });
                LALayerIdList.push(layerId + "_text");
            }
        }
    }

    // 装料区规划路线，使用瓦片加载
    let roadSectionList = areaInfo.roadSectionList;
    if(isNotEmpty(roadSectionList)){
        if(!map.hasImage("arrowIcon")){
            let arrowIcon = new Image(10, 10)
            arrowIcon.src = "/map/img/arrow-icon.svg";
            arrowIcon.onload = function() {
                map.addImage('arrowIcon', arrowIcon);
            }
        }

        let paint;
        for (let i = 0; i < roadSectionList.length; i++) {
            let roadSection = roadSectionList[i];
            let id = roadSection.id;
            let name = roadSection.directionType;
            let layerId = "roadSection_" + id;
            if(!map.getSource(layerId)){
                /*let tiles_href = window.location.origin + "/map/getTiles/" + roadSection.sourceName + "/" + id + "/{z}/{x}/{y}.mvt";
                map.addSource(layerId, {
                    type: 'vector',
                    tiles:[tiles_href],
                    bounds: [118.42295002114071, 44.7882842153993, 118.51215205073385, 44.85348501891053],
                    minzoom: 13,
                    maxzoom: 22,
                    attribution: ""
                });*/
                let geojson = JSON.parse(roadSection.geojson);
                map.addSource(layerId, {
                    "type": "geojson",
                    "data": {
                        "type": "Feature",
                        "geometry": geojson,
                    },
                    "maxzoom": 22
                });
                LASourceIdList.push(layerId);
            }

            if(!map.getLayer(layerId)){
                paint = isEmpty(roadSection.style) ? {
                    //"line-color": "#ff0000",
                    "line-color": randomColor(),
                    "line-width": [
                        "interpolate", ["linear"], ["zoom"],
                        15, 3,
                        22, 5
                    ]
                } : JSON.parse(roadSection.style);

                map.addLayer({
                    'id': layerId,
                    'source': layerId,
                    //'source-layer': "line",
                    'type': 'line',
                    "layout": {
                        "visibility": "visible",
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    "paint": paint
                });
                LALayerIdList.push(layerId);
                // 线图标
                map.addLayer({
                    'id': layerId + "_icon",
                    'source': layerId,
                    //'source-layer': "line",
                    'type': 'symbol',
                    "minzoom": 13,
                    "maxzoom": 22,
                    'layout': {
                        "visibility": "visible",
                        'symbol-placement': 'line',
                        'symbol-spacing': 120,
                        'icon-image': 'arrowIcon',
                        'icon-size': 1,
                        //'icon-rotate': 90,
                    }
                });
                LALayerIdList.push(layerId + "_icon");
                // 线文本
                map.addLayer({
                    "id": layerId + "_text",
                    'source': layerId,
                    //'source-layer': "line",
                    "type": "symbol",
                    "minzoom": 13,
                    "maxzoom": 22,
                    "layout": {
                        "visibility": "visible",
                        'symbol-placement': 'line-center',
                        "text-field": name,
                        "text-size": 12,
                        "text-rotation-alignment": "viewport",
                        "text-pitch-alignment": "viewport",
                    },
                    paint: {
                        "text-opacity": 1,
                        "text-color": "#ffffff",
                        "text-halo-color": "#36b368",
                        "text-halo-width": 100,
                        "text-halo-blur": 0,
                    }
                });
                LALayerIdList.push(layerId + "_text");
            }
        }
    }

    // 装料区挖机位置线，使用GEOJSON加载
    let areaExcavatorPositionList = areaInfo.areaExcavatorPositionList;
    if(isNotEmpty(areaExcavatorPositionList)){
        if(!map.hasImage("arrowIcon")){
            let arrowIcon = new Image(10, 10)
            arrowIcon.src = "/map/img/arrow-icon.svg";
            arrowIcon.onload = function() {
                map.addImage('arrowIcon', arrowIcon);
            }
        }
        for (let i = 0; i < areaExcavatorPositionList.length; i++) {
            let id = areaExcavatorPositionList[i].id;
            let name = areaExcavatorPositionList[i].excavatorNumber;
            let real_name = areaExcavatorPositionList[i].realExcavatorNumber;
            if(isNotEmpty(real_name)){
                name = name + "---" + real_name;
            }
            let layerId = "areaExcavator_" + id;
            let geojson = JSON.parse(areaExcavatorPositionList[i].presetLineGeojson);

            if(!map.getSource(layerId)){
                map.addSource(layerId, {
                    "type": "geojson",
                    "data": {
                        "type": "Feature",
                        "geometry": geojson
                    },
                    maxzoom: 22
                });
                LASourceIdList.push(layerId);
            }

            if(!map.getLayer(layerId)){
                map.addLayer({
                    'id': layerId,
                    'source': layerId,
                    //'source-layer': "line",
                    'type': 'line',
                    "layout": {
                        "visibility": "visible",
                        'line-cap': 'round',
                        'line-join': 'round'
                    },
                    "paint": {
                        "line-color": "#fff800",
                        "line-width": [
                            "interpolate", ["linear"], ["zoom"],
                            13, 1,
                            22, 5
                        ]
                    }
                });
                LALayerIdList.push(layerId);

                // 线图标
                map.addLayer({
                    'id': layerId + "_icon",
                    'source': layerId,
                    //'source-layer': "line",
                    'type': 'symbol',
                    "minzoom": 13,
                    "maxzoom": 24,
                    'layout': {
                        "visibility": "visible",
                        'symbol-placement': 'line',
                        'symbol-spacing': 120,
                        'icon-image': 'arrowIcon',
                        'icon-size': 1.2,
                        //'icon-rotate': 90,
                    }
                });
                LALayerIdList.push(layerId + "_icon");

                // 线文本
                map.addLayer({
                    "id": layerId + "_text",
                    'source': layerId,
                    //'source-layer': "line",
                    "type": "symbol",
                    "minzoom": 13,
                    "maxzoom": 22,
                    "layout": {
                        "visibility": "visible",
                        'symbol-placement': 'line-center',
                        "text-field": name,
                        "text-size": 14,
                        "text-rotation-alignment": "viewport",
                        "text-pitch-alignment": "viewport",
                    },
                    paint: {
                        "text-opacity": 1,
                        "text-color": "#ffffff",
                        "text-halo-color": "#36b368",
                        "text-halo-width": 100,
                        "text-halo-blur": 0,
                    }
                });
                LALayerIdList.push(layerId + "_text");
            }
        }
    }

    flyToLayer(areaInfo.geojson);

}
/**
 * 加载规划路线
 *
 * @param data
 */
function loadPlannedRoadLine(data) {
    if(isEmpty(data)){
        return;
    }

    let geometries = [];
    geometries.push(JSON.parse(data.route_I));
    geometries.push(JSON.parse(data.route_B));
    geometries.push(JSON.parse(data.route_O));

    let layerId = "plannedRoadLine";

    if(!map.getSource(layerId)){
        map.addSource(layerId, {
            type: "geojson",
            /*data: {
                "type": "Feature",
                "geometry": geojson
            }*/
            data: {
                "type": "GeometryCollection",
                "geometries": geometries
            }
        });
    } else {
        map.getSource(layerId).setData({
            "type": "GeometryCollection",
            "geometries": geometries
        });
    }

    if(!map.getLayer(layerId)){
        map.addLayer({
            id: layerId,
            type: 'line',
            source: layerId,
            paint: {
                'line-color': '#ffbb00',
                'line-width': [
                    "interpolate", ["linear"], ["zoom"],
                    13, 2,
                    22, 5
                ],
                'line-opacity': 0.4
            }
        });
    }

    if(!map.getLayer(layerId + "Dashed")){
        map.addLayer({
            id: layerId + "Dashed",
            type: 'line',
            source: layerId,
            paint: {
                'line-color': '#FFFF00',
                'line-width': [
                    "interpolate", ["linear"], ["zoom"],
                    13, 2,
                    22, 5
                ],
                'line-dasharray': [0, 4, 3],
            }
        });
    }

    let dashArraySequence = [
        [0, 4, 3],
        [0.5, 4, 2.5],
        [1, 4, 2],
        [1.5, 4, 1.5],
        [2, 4, 1],
        [2.5, 4, 0.5],
        [3, 4, 0],
        [0, 0.5, 3, 3.5],
        [0, 1, 3, 3],
        [0, 1.5, 3, 2.5],
        [0, 2, 3, 2],
        [0, 2.5, 3, 1.5],
        [0, 3, 3, 1],
        [0, 3.5, 3, 0.5]
    ];

    let step = 0;
    function animateDashArray(timestamp) {
        let newStep = parseInt(
            (timestamp / 100) % dashArraySequence.length
        );

        if (newStep !== step) {
            map.setPaintProperty(
                layerId + "Dashed",
                'line-dasharray',
                dashArraySequence[step]
            );
            step = newStep;
        }

        plannedRoadLineAnimation = requestAnimationFrame(animateDashArray);
    }

    //plannedRoadLineAnimation = requestAnimationFrame(animateDashArray);
    animateDashArray(0);
}
/**
 * 删除回显的规划路线图层
 */
function removePlannedRoadLineLayers() {
    let layerId = "plannedRoadLine";
    if(map.getLayer(layerId)){
        window.cancelAnimationFrame(plannedRoadLineAnimation);
        map.removeLayer(layerId);
        map.removeLayer(layerId + "Dashed");
    }
    if(map.getSource(layerId)){
        map.removeSource(layerId);
    }
}