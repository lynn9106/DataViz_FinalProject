import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

// The svg
const svg = d3.select("#my_dataviz")
const width = +svg.attr("width")
const height = +svg.attr("height");
const margin = {top: 100, right: 100, bottom: 100, left: 100};
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

const projection = d3.geoMercator()
    .center([121, 24])
    .scale(4000)
    .translate([width / 2, height / 2]);

const geoPath = d3.geoPath()
    .projection(projection);

const line = d3.line()
    .x(d => x(d))
    .y(d => y(d));

const x = d => projection([d['longitude'], d['latitude']])[0];
const y = d => projection([d['longitude'], d['latitude']])[1];

const length = (path) => d3.create("svg:path").attr("d", path).node().getTotalLength();

const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
const radiusScale = d3.scaleLinear().domain([0, 10]).range([1, 50]);

// let taiwanMap;
let typhoon_list = [];
let selected_typhoon = {};
let filter_typhoon = [];

const { timeScale, timeAxis } = initializeTimeAxis();

// Create a tooltip div that is hidden by default
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("opacity", 0);

// add a selectAll and unslectAll button
initializeButtons();

// Load external data and boot
Promise.all([
    d3.json("./data/taiwan.json"),
    d3.csv("./data/track_info.csv"),
    d3.csv("./data/city.csv"),
    d3.csv("./data/combined_data_all.csv")
]).then(function(rawdata){
    renderTaiwanMap(rawdata[0]);
    processTyphoonData(rawdata[1]);
    processCityData(rawdata[2],rawdata[3]);
    render(typhoon_list);
})

const render = (typhoon_list) => {
    updateTyphoonGraph(typhoon_list);
    updateTooltip();
}

function processTyphoonData(typhoon_data) {
    let typhoon_map = {};

    typhoon_data = typhoon_data.filter(d => {
        const [x, y] = projection([+d["經度"], +d["緯度"]]);
        return x >= margin.left && x <= width - margin.right && y >= margin.top && y <= height - margin.bottom;
    });
    
    typhoon_data.forEach(d => {
        if (typhoon_map[d["颱風編號"]] == undefined) {
            typhoon_map[d["颱風編號"]] = [];
        }
        typhoon_map[d["颱風編號"]].push({
            id: d["颱風編號"],
            time: new Date(`${d['年']}/${d['月']}/${d['日']} ${d['時']}:00`),
            longitude: +d["經度"],
            latitude: +d["緯度"],
            wind_speed: +d["最大風速"],
            pressure: +d["中心氣壓"],
            level: d["階級"],
        });
    });

    const typhoonGroup = svg.append("g")
        .attr("class", "typhoon-container");

    for (let key in typhoon_map) {
        createTyphoonCheckbox(key);

        typhoon_list.push({
            id: key,
            info: typhoon_map[key]
        });
        typhoonGroup.append("g")
            .attr("class", "typhoon_container_" + key);
    }
    filter_typhoon = typhoon_list;
}

function renderTaiwanMap(taiwanMap) {

    // Create the SVG container
    const gTaiwan = svg.append("g")
        .attr("class","taiwan_map");

    // enable zoom in
    svg.call(d3.zoom().on("zoom",(event) => {
        gTaiwan.attr("transform", event.transform);
        }));

    const geometries = topojson.feature([taiwanMap][0], [taiwanMap][0].objects["COUNTY_MOI_1130718"])
    gTaiwan.selectAll("path")
            .data(geometries.features)
            .enter()
            .append("path")
            .attr("d", geoPath)
            .attr("class", "county")
            .append("title")
            .text(d => d.properties["COUNTYNAME"]); 
}

function initializeTimeAxis() {
    const timeScale = d3.scaleLinear()
        .domain([0, 7])
        .range([width / 2 - 300, width / 2 + 300]);

    // 建立時間軸
    const timeAxis = d3.axisBottom(timeScale)
        .tickFormat(d => `${d} days`)
        .tickValues(d3.range(0, 8));

    svg.append("g")
        .attr("class", "time-axis")
        .attr("transform", `translate(0, ${height - 50})`)
        .call(timeAxis);

    // 建立刷選功能
    const brush = d3.brushX()
        .extent([[timeScale.range()[0], 0], [timeScale.range()[1], height - 50]])
        .on("end", brushed);

    svg.append("g")
        .attr("class", "brush")
        .attr("transform", `translate(0, ${height - 50})`)
        .call(brush);
    return { timeScale, timeAxis };
}

function initializeButtons() {
    d3.select("#selectAll").on("click", function () {
        d3.selectAll("input").property("checked", true);
        for (let key in selected_typhoon) {
            selected_typhoon[key] = true;
        }
        onCheckboxChange();
    });

    d3.select("#selectNone").on("click", function () {
        d3.selectAll("input").property("checked", false);
        for (let key in selected_typhoon) {
            selected_typhoon[key] = false;
        }
        onCheckboxChange();
    });
}

function updateTooltip() {
    // Add mouseover, mousemove, and mouseout events to the typhoon paths and wind circles
    d3.select('.typhoon-container').selectAll(".wind-circle")
        .on("mouseover", function (event, d) {
            d3.select(this)
            .transition()
                .duration(50)
                .attr("r", radiusScale(d.level) * 2)
                .style("stroke-width", 3);

            tooltip.transition()
                .duration(50)
                .style("opacity", .9);

            tooltip.html(`ID: ${d.id}<br/>Time: ${d3.timeFormat("%Y/%m/%d %H:%M")(d.time)}<br/>Wind Speed: ${d.wind_speed}<br/>Pressure: ${d.pressure}<br/>Level: ${d.level}`)
                .style("left", (event.pageX + 20) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 20) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function (event, d) {
            d3.select(this)
            .transition()
                .duration(50)
                .attr("r", radiusScale(d.level))
                .style("stroke-width", 1);

            tooltip.transition()
                .duration(50)
                .style("opacity", 0);

            tooltip.style("left", "-100px").style("top", "-100px");
        });
}

function updateTyphoonGraph(typhoon_list) {
    typhoon_list.forEach(typhoon => {
        const id = typhoon.id;
        typhoon = typhoon.info;
        if (selected_typhoon[id] == false) {
            typhoon = [];
        }
        const container = d3.select(".typhoon_container_" + id);
        container
            .transition()
            .duration(500)
            .attr("opacity", selected_typhoon[id] ? 1 : 0);
        container.selectAll("path").remove();
        container
            .append("path")
            .datum(typhoon)
            .attr("d", line)
            .style("stroke", colorScale(id))
            .style("fill", "none")
            .style("stroke-width", 1);
        //     .attr("stroke-dasharray", `0, ${length(line(typhoon))}`)
        // .transition()
        //     .duration(10000)
        //     .attr("stroke-dasharray", `${length(line(typhoon))}, ${length(line(typhoon))}`);
        const circles = container
            .selectAll(".wind-circle")
            .data(typhoon, d => d.time);

        circles.enter()
            .append("circle")
            .attr("class", "wind-circle")
            .attr("cx", d => x(d))
            .attr("cy", d => y(d))
            .attr("r", 0)
            .style("stroke", colorScale(id))
            .style("stroke-width", 1)
            .style("fill", colorScale(id))
            .style("fill-opacity", 0.1)
            .transition()
            .delay((d, i) => i * 100)
            .duration(500)
            .attr("r", d => radiusScale(d.level));


        circles.exit()
            .transition()
            .duration(500)
            .attr("r", 0)
            .remove();

        const points = container
            .selectAll(".typhoon-point")
            .data(typhoon, d => d.time);

        points.enter()
            .append("circle")
            .attr("class", "typhoon-point")
            .attr("cx", d => x(d))
            .attr("cy", d => y(d))
            .attr("r", 3)
            .style("fill", colorScale(id));

        points.exit()
            .remove();
    });
}

let x0;
let x1;
let selection;

function brushed(event) {
    selection = event.selection;
    if (selection) {
        [x0, x1] = selection.map(timeScale.invert);
        let x0_time = x0 * 24 * 60 * 60 * 1000;
        let x1_time = x1 * 24 * 60 * 60 * 1000;

        filter_typhoon = typhoon_list.map(typhoon => ({
            id: typhoon.id,
            info: typhoon.info.filter(d => d.time - typhoon.info[0].time >= x0_time && d.time - typhoon.info[0].time <= x1_time)
        }));

        render(filter_typhoon);
    }
    else{
        filter_typhoon = typhoon_list;
        render(filter_typhoon);
    }
}

function createTyphoonCheckbox(key) {
    selected_typhoon[key] = false;
    d3.select("#typhoon_options")
        .append("input")
        .attr("type", "checkbox")
        .attr("value", key)
        .attr("id", "checkbox_" + key)
        .property("checked", false) // Set default selection to checked
        .on("change", onCheckboxChange);
    d3.select("#typhoon_options")
        .append("label")
        .attr("for", "checkbox_" + key)
        .text(key);
}

function onCheckboxChange() {
    if(this){
        if (d3.select(this).attr("type") === "checkbox") {
            const key = d3.select(this).attr("value");
            const checked = d3.select(this).property("checked");
            if (checked) {
                selected_typhoon[key] = true;
            } else {
                selected_typhoon[key] = false;
            }
        }
    }
    let maxTimePeriod = d3.max(typhoon_list.filter(typhoon => selected_typhoon[typhoon.id] == true).map(typhoon => typhoon.info[typhoon.info.length - 1].time - typhoon.info[0].time));
    maxTimePeriod = maxTimePeriod / (24 * 60 * 60 * 1000);
    if(!isNaN(maxTimePeriod)){
        console.log("max",maxTimePeriod)
        timeScale.domain([0, maxTimePeriod]);
        timeAxis.tickValues(d3.range(0, maxTimePeriod));
        svg.select(".time-axis").call(timeAxis);
    }
    else{
        timeScale.domain([0, 7]);
        timeAxis.tickValues(d3.range(0, 8));
        svg.select(".time-axis").call(timeAxis);
    }
    if(!selection){
        x0 = 0;
        x1 = d3.max(typhoon_list.filter(typhoon => selected_typhoon[typhoon.id] == true).map(typhoon => typhoon.info[typhoon.info.length - 1].time - typhoon.info[0].time));
        x1 = x1/ (24 * 60 * 60 * 1000)
    }


    render(filter_typhoon);
}

function processCityData(cityData, combinedData) {
    // Clean the combined data
    combinedData = combinedData.filter(d => {
        // Remove rows with placeholder or empty values
        return d['日期'] && 
               d['觀測時間(hour)'] && 
               d['觀測時間(hour)'] !== 'Obs0.1ime' &&
               d['降水量(mm)'] !== 'Precp' &&
               d['風速(m/s)'] !== 'WS';
    }).map(d => {
        // Ensure proper date parsing
        const date = d['日期'].trim();
        const time = d['觀測時間(hour)'].trim();
        
        // Validate and parse time
        if (!date || !time) {
            console.warn('Invalid date or time', d);
            return null;
        }

        try {
            // Attempt to create a valid date object
            const parsedTime = new Date(`${date} ${time}:00`);
            
            return {
                ...d,
                time: parsedTime,
                '降水量(mm)': parseFloat(d['降水量(mm)']) || 0,
                '風速(m/s)': parseFloat(d['風速(m/s)']) || 0
            };
        } catch (error) {
            console.warn('Error parsing time', error, d);
            return null;
        }
    }).filter(d => d !== null); // Remove any null entries

    const gTaiwan = svg.select(".taiwan_map");
    const cityGroup = gTaiwan.append("g")
                        .attr("class", "city-landmarks");

    // Add city landmarks as circles
    cityGroup.selectAll("circle")
        .data(cityData)
        .enter()
        .append("circle")
        .attr("cx", d => projection([+d.Longitude, +d.Latitude])[0])
        .attr("cy", d => projection([+d.Longitude, +d.Latitude])[1])
        .attr("r", 3)
        .attr("fill", "red")
        .attr("class", "city-landmark")
        .attr("id", d => `city-${d.City}`)
        .on("click", (event, d) => showCityDetails(d, combinedData, filter_typhoon));

    // Add city labels
    cityGroup.selectAll("text")
        .data(cityData)
        .enter()
        .append("text")
        .attr("x", d => projection([+d.Longitude, +d.Latitude])[0] + 5)
        .attr("y", d => projection([+d.Longitude, +d.Latitude])[1])
        .text(d => d.City)
        .attr("font-size", "8px")
        .attr("fill", "black");
}
function showCityDetails(cityData, combinedData, filter_typhoon) {
    if(!x0){
        x0 = 0;
    }
    if(!x1){
        x1 = d3.max(typhoon_list.filter(typhoon => selected_typhoon[typhoon.id] == true).map(typhoon => typhoon.info[typhoon.info.length - 1].time - typhoon.info[0].time));
        x1 = x1/ (24 * 60 * 60 * 1000)
    }
    let cityWeatherData = {};
    const cityName = cityData.City;

    filter_typhoon.forEach(typhoon => {
        const id = typhoon.id;
        
        // Skip if typhoon not selected
        if (!selected_typhoon[id]) return;

        // Ensure typhoon info exists and has at least one data point
        if (!typhoon.info || typhoon.info.length === 0) return;

        let typhoonStart = typhoon.info[0].time;
        let typhoonEnd = typhoon.info[typhoon.info.length - 1].time;

        // Filter relevant data for this typhoon and city
        const relevantData = combinedData.filter(d => 
            d.測站 === cityData.測站 && 
            d.time >= typhoonStart && 
            d.time <= typhoonEnd
        );

        if (relevantData.length > 0) {
            cityWeatherData[id] = relevantData;
        }
    });

    // Check if we have any data before rendering
    if (Object.keys(cityWeatherData).length === 0) {
        alert(`No weather data available for ${cityName}`);
        return;
    }


    // console.log(cityWeatherData)
    renderCityLineChart(cityWeatherData, cityName);
}

function renderCityLineChart(cityWeatherData, cityName) {
    // Clear any existing chart
    d3.select("#city-details-chart").selectAll("*").remove();

    // Create a modal for the chart
    const chartContainer = d3.select("body")
        .append("div")
        .attr("id", "city-details-chart")
        .style("position", "fixed")
        .style("top", "50%")
        .style("left", "50%")
        .style("transform", "translate(-50%, -50%)")
        .style("width", "80%")
        .style("height", "70%")
        .style("background", "white")
        .style("border", "1px solid black")
        .style("padding", "20px")
        .style("z-index", "1000");

    chartContainer.append("text")
        .style("position", "absolute")
        .style("top", "30px")
        .style("right", "30px")
        .style("font-size", "25px")
        .style("font-weight", "bold")
        .style("cursor", "pointer")
        .style("fill", "black")
        .text("✖")
        .on("click", function () {
            d3.select("#city-details-chart").remove();
        });

    // Title
    chartContainer.append("h2")
        .text(`${cityName}`);

    // Create SVG for charts
    const svg = chartContainer.append("svg")
        .attr("width", "100%")
        .attr("height", "80%");

    // Prepare for two charts (precipitation and wind speed)
    const margin = {top: 50, right: 50, bottom: 50, left: 50};
    const width = parseInt(svg.style("width")) - margin.left - margin.right;
    const height = (parseInt(svg.style("height")) / 2) - margin.top - margin.bottom;

    // Precipitation Chart
    const precipChart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Wind Speed Chart
    const windChart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top + height + margin.bottom + 50})`);

    // Prepare data for each typhoon
    Object.keys(cityWeatherData).forEach((typhoonId, index) => {
        const data = cityWeatherData[typhoonId];


        console.log("x0",x0)
        console.log("x1",x1)
        // Time scale (common for both charts)
        const xScale = d3.scaleTime()
        .domain([x0, x1])
        .range([0, width]);

        // Precipitation Y-scale
        const precipExtent = d3.extent(data, d => +d['降水量(mm)']);
        if (precipExtent[1] == 0){precipExtent[1] =1;}
        const precipYScale = d3.scaleLinear()
            .domain([0, precipExtent[1]*1.1])
            .range([height, 0]);

        // Wind Speed Y-scale
        const windExtent = d3.extent(data, d => +d['風速(m/s)']);
        const windYScale = d3.scaleLinear()
            .domain([0, windExtent[1]*1.1])
            .range([height, 0]);

        // Color for this typhoon
        const color = colorScale(typhoonId);

        // Precipitation Line
        const typhoon = typhoon_list.find(item => item.id === typhoonId);
        const precipLine = d3.line()
            .x(d => xScale((d.time - typhoon.info[0].time)/ (24 * 60 * 60 * 1000)))
            .y(d => precipYScale(+d['降水量(mm)']));

        precipChart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("d", precipLine);

        // Wind Speed Line
        const windLine = d3.line()
            .x(d => xScale((d.time - typhoon.info[0].time)/ (24 * 60 * 60 * 1000)))
            .y(d => windYScale(+d['風速(m/s)']));

        windChart.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("d", windLine);

        // Axes for Precipitation Chart
        precipChart.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale).tickValues(d3.range(x0, x1)));

        precipChart.append("g")
            .call(d3.axisLeft(precipYScale));

        precipChart.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(`Precipitation (mm) - Typhoon ${typhoonId}`);

        // Axes for Wind Speed Chart
        windChart.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale).tickValues(d3.range(x0, x1)));

        windChart.append("g")
            .call(d3.axisLeft(windYScale));

        windChart.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (height / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(`Wind Speed (m/s) - Typhoon ${typhoonId}`);    
    });
// Add legend for Typhoon colors
const legend = chartContainer.append("div")
    .style("position", "absolute")
    .style("top", "30px")
    .style("left", "100px")
    .style("display", "flex")
    .style("flex-direction", "column");

Object.keys(cityWeatherData).forEach((typhoonId, index) => {
    const color = colorScale(typhoonId);

    const legendItem = legend.append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("margin-bottom", "5px");

    // Legend color square
    legendItem.append("div")
        .style("width", "15px")
        .style("height", "15px")
        .style("background-color", color)
        .style("margin-right", "5px");

    // Legend text
    legendItem.append("span")
        .text(`Typhoon ${typhoonId}`)
        .style("font-size", "12px");
});


}