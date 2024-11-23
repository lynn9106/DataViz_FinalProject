import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';
import { dropdownMenu } from './dropdownMenu.js';


let mergedData;
// Set dimensions for the SVG container
const width = 900;
const height = 600;

// Create the SVG container
const svgMain = d3.select("#mainPlot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

const gTaiwan = svgMain.append("g")
    .attr("class","taiwan_map");

// enable zoom in
svgMain.call(d3.zoom().on("zoom",(event) => {
    gTaiwan.attr("transform", event.transform);
    }));


// create Taiwan map
const projectmethod = d3.geoMercator().center([123, 24]).scale(5500);
const pathGenerator = d3.geoPath().projection(projectmethod); // create the path
d3.json("./data/COUNTY_MOI_1130718.json")
  .then(data => {
    // console.log(data)
    const geometries = topojson.feature(data, data.objects["COUNTY_MOI_1130718"])
    // console.log(geometries);

    gTaiwan.append("path")
    const path = gTaiwan.selectAll("path").data(geometries.features);
    path.enter()
        .append("path")
        .attr("d",pathGenerator)
        .attr("class","county")
        .append("title")
        .text(d => d.properties["COUNTYNAME"])

  })

// dropdown Menu
let selectedTyphoon = '紅霞(NOUL)'; 

const onTyphoonClicked = (c) => {
    selectedTyphoon = c;
    render(selectedTyphoon);
  };
  
function createTyphoonMenu(data){
    const typhoon_list = [...new Set(data.map(d => d.typhoonName))];

    d3.select('#typhoon-menu').call(dropdownMenu, {
        options: typhoon_list,
        onOptionClicked: onTyphoonClicked,
        selectedOption: selectedTyphoon,
    });
}

// Time Line
function createTimeline(data) {
    const margin = { top: 50, right: 50, bottom: 50, left: 50 };
    const timelineWidth = width - margin.left - margin.right;
    const timelineHeight = 50;

    const formatDay = d3.timeFormat("%Y/%m/%d");
    const formatTime = d3.timeFormat("%m/%d %H:%M");

    const orderedTimestamps = [...new Set(data.map(d => d.timestamp))]
                            .map(d => new Date(d))
                            .sort((a, b) => a - b);

    const uniqueDays = [...new Set(orderedTimestamps.map(d => d.toISOString().split("T")[0]))]
                            .map(d => new Date(d));


    d3.select("#mainPlot").selectAll("svg#timeline").remove();

    const timelineSvg = d3.select("#mainPlot")
                            .append("svg")
                            .attr("id", "timeline")
                            .attr("width", timelineWidth + margin.left + margin.right)
                            .attr("height", timelineHeight + margin.top + margin.bottom)

    const slider = timelineSvg.append("g")
                                .attr("class", "timeslider")
                                .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const timeScale = d3.scaleTime()
                        .domain(d3.extent(orderedTimestamps))
                        .range([0, timelineWidth])
                        .clamp(true);

    slider.append("line")
            .attr("class","track")
            .attr("x1", timeScale.range()[0])
            .attr("x2", timeScale.range()[1])
            .select( function(){
                return this.parentNode.appendChild(this.cloneNode(true));
            })
            .attr("class","track-inset")
            .select(function () {
                return this.parentNode.appendChild(this.cloneNode(true));
            })
            .attr("class", "track-overlay")
   
            
    slider.insert("g", ".track-overlay")
            .attr("class", "ticks")
            .attr("transform", "translate(0," + 18 + ")")
            .selectAll("text")
            .data(uniqueDays)
            .enter()
            .append("text")
            .attr("x", d => timeScale(d))
            .attr("y", 10)
            .attr("text-anchor", "middle")
            .text(d => formatDay(d));       

    const handle = slider.insert("circle",".track-overlay")
                            .attr("class","handle")
                            .attr("r",9);
    
    const timelabel = slider.append("text")
                                .attr("class","timelabel")
                                .attr("text-anchor","middle")
                                .text(formatTime(orderedTimestamps[0]))
                                .attr("transform", "translate(0," + -25 + ")");

    slider.call(
        d3.drag()
            .on("start.interrupt", () => slider.interrupt())
            .on("start drag", (event) => {
                const currentTime = timeScale.invert(event.x - margin.left);

                const closestTime = orderedTimestamps.reduce((a, b) => 
                    Math.abs(a - currentTime) < Math.abs(b - currentTime) ? a : b
                );
            
                // Update handle position
                handle.attr("cx", timeScale(closestTime));
            
                // Update time label
                timelabel.attr("x", timeScale(closestTime))
                .text(formatTime(closestTime));

                // Update the map
                updateMap(closestTime, data);
            })
    );
}

// process data
Promise.all([
    d3.json("./data/stations.json"), // station info
    d3.csv("./data/rain_statistics.csv"),    // rain info
    d3.csv("./data/wind_statistics.csv")    // rain info
]).then(([stationsData, rainData, windData]) => {
    processAndMergeData(stationsData, rainData, windData);
    render(selectedTyphoon);
});

function processAndMergeData(stationsData, rainData, windData) {
    // console.log(stationsData);
    const stationMap = {};
    stationsData.cwaopendata.resources.resource.data.stationsStatus.station.forEach(d=>{
        stationMap[d.StationID] = {
            name: d.StationName,
            latitude: +d.StationLatitude,
            longitude: +d.StationLongitude,
            altitude: +d.StationAltitude,
            county: d.CountyName
        };
    })

    mergedData = rainData.map(rain=> {
        rain["測站"] = rain["測站"].slice(0,6)
        const stationInfo = stationMap[rain["測站"]]
        const wind = windData.find(w => 
                                       w["測站"] === rain["測站"] &&
                                       w["觀測時間"] === rain["累積結束時間"]);
        if (!wind) {
        console.warn(`No wind data found for station ${rain["測站"]} at time ${rain["累積結束時間"]}`);
        }
        return{
            typhoonID: rain["颱風編號"],
            typhoonName: rain["颱風名稱"],
            stationID: rain["測站"],
            stationName: stationInfo?.name,
            latitude: stationInfo?.latitude,
            longitude: stationInfo?.longitude,
            county: stationInfo?.county,
            accPrecipitation: +rain["累積雨量"],
            maxWindSpeed: +wind?.["最大風風速"] || 0,
            maxWindDirection: +wind?.["最大風風向"] || 0,
            timestamp: new Date(wind?.["觀測時間"] || rain["累積結束時間"])
        }
    })

    mergedData = mergedData.sort((a, b) => a.timestamp - b.timestamp );

}

const render = (selectedTyphoon) => {
    createTyphoonMenu(mergedData);
    const data = mergedData.filter(d=> d.typhoonName === selectedTyphoon)
    createTimeline(data);
    updateMap(new Date(data[0].timestamp), data);
}


svgMain.append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")  // (x,y,width,height)
    .attr("refX", 0) // offset
    .attr("refY", 0)
    .attr("markerWidth", 4)
    .attr("markerHeight", 4)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")  // This is the path for the arrowhead, drawing a triangle
    .attr("fill", "red");


function updateMap(selectedTime, data){
    const filteredData = data.filter(d => new Date(d.timestamp).getTime() === selectedTime.getTime());

    d3.selectAll(".station-circle, .wind-arrow").remove();

    const rainScale = d3.scaleSqrt()
    .domain([0, d3.max(data, d => d.accPrecipitation)])
    .range([2, 20]);

    const rainOpacityScale = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.accPrecipitation)])
    .range([0.3, 0.85]);

    const windScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.maxWindSpeed)])
        .range([0, 100]);

    gTaiwan.selectAll("circle")
            .data(filteredData)
            .enter()
            .append("circle")
            .attr("class", "station-circle")
            .attr("cx", d => projectmethod([d.longitude, d.latitude])[0])
            .attr("cy", d => projectmethod([d.longitude, d.latitude])[1])
            .attr("r", d => rainScale(d.accPrecipitation))
            .attr("fill", "blue")
            .attr("opacity", d =>rainOpacityScale(d.accPrecipitation));

    gTaiwan.selectAll("line")
            .data(filteredData)
            .enter()
            .append("line")
            .attr("class", "wind-arrow")
            .attr("x1", d => projectmethod([d.longitude, d.latitude])[0])  // Starting X coordinate (station)
            .attr("y1", d => projectmethod([d.longitude, d.latitude])[1])  // Starting Y coordinate (station)
            .attr("x2", d => projectmethod([d.longitude, d.latitude])[0] + windScale(d.maxWindSpeed) * Math.cos(d.maxWindDirection * Math.PI / 180))  // Ending X coordinate based on wind speed and direction
            .attr("y2", d => projectmethod([d.longitude, d.latitude])[1] - windScale(d.maxWindSpeed) * Math.sin(d.maxWindDirection * Math.PI / 180))  // Ending Y coordinate based on wind speed and direction
            .attr("stroke", "red")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrow)");  // Attach the arrow marker at the end of the line
}
