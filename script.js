let map;
let directionsService;
let directionsRenderer;
let markers = [];
let geocoder;
let alternativeRoutePolylines = [];
let routeMarkers = [];
const WEATHER_API_KEY = 'cb2b4f87fa25e08b86c6f97bd90eaa38'; // Replace with your OpenWeatherMap API key
let currentWeather = null;

function initMap() {
    // Initialize the map
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: -15.793889, lng: -47.882778 }, // Default center on Brazil
        zoom: 4,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true
    });

    // Initialize services
    directionsService = new google.maps.DirectionsService();

    // Initialize the main DirectionsRenderer
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true, // We add custom markers
        polylineOptions: {
            strokeColor: '#4CAF50', // Green for main route
            strokeWeight: 6,
            strokeOpacity: 1,
        }
    });
    directionsRenderer.setMap(map);
    geocoder = new google.maps.Geocoder();

    // Add click listener to map to set start/end points
    map.addListener('click', handleMapClick);

    // Add event listener to the find route button
    document.getElementById('findRoute').addEventListener('click', calculateRoute);

    // Attempt to initialize with current location
    initializeWithCurrentLocation();

    // Add event listeners for the chat bot
    document.getElementById('sendChat').addEventListener('click', handleChatInput);
    document.getElementById('chatInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            handleChatInput();
        }
    });
}

// Function to get current location and initialize map/weather
function initializeWithCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            const userLatLng = new google.maps.LatLng(userLat, userLng);

            // Center map on user location with a higher zoom
            map.setCenter(userLatLng);
            map.setZoom(12); // Adjust zoom level as needed

            // Fetch and display weather for the current location
            const weatherData = await fetchWeatherData(userLat, userLng);
            const weatherAnalysis = analyzeWeatherConditions(weatherData);
            displayWeatherInfo(weatherAnalysis);

            // Attempt to get address and populate 'from' input
            geocoder.geocode({ location: userLatLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    document.getElementById('from').value = results[0].formatted_address;
                     // Add a marker for the current location
                    addMarker(userLatLng, 'from');
                } else {
                    console.log('Geocoder failed to find address for current location:', status);
                     // Still add a marker even if address isn't found
                     addMarker(userLatLng, 'from');
                }
            });

        }, (error) => {
            console.error('Error getting current location:', error);
            // Fallback: keep default map center and show a message
            displayWeatherInfo({ safe: false, warnings: ['Could not retrieve your location for weather information and starting point.'] });
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
         // Fallback: keep default map center and show a message
        displayWeatherInfo({ safe: false, warnings: ['Geolocation not supported by your browser.'] });
    }
}

// Handles map clicks to set start/end locations
function handleMapClick(event) {
    const latlng = event.latLng;
    geocoder.geocode({ location: latlng }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const address = results[0].formatted_address;
            const fromInput = document.getElementById('from');
            const toInput = document.getElementById('to');

            if (fromInput.value === '') {
                fromInput.value = address;
                addMarker(latlng, 'from');
            } else if (toInput.value === '') {
                toInput.value = address;
                addMarker(latlng, 'to');
            } else {
                // If both are filled, replace the 'from' location
                fromInput.value = address;
                toInput.value = ''; // Clear the 'to' field
                removeMarker('to'); // Remove the old 'to' marker
                addMarker(latlng, 'from');
            }
        } else {
            alert('Could not get address for this location.');
        }
    });
}

// Adds a start or end marker to the map (for map clicks)
function addMarker(position, type) {
    // Remove existing marker of the same type
    const index = markers.findIndex(m => m.type === type);
    if (index !== -1) {
        markers[index].marker.setMap(null);
        markers.splice(index, 1);
    }

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: type === 'from' ? '#4CAF50' : '#ff0000',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        }
    });
    markers.push({ type, marker });
}

// Removes a start or end marker from the map (from map clicks)
function removeMarker(type) {
     const index = markers.findIndex(m => m.type === type);
    if (index !== -1) {
        markers[index].marker.setMap(null);
        markers.splice(index, 1);
    }
}

// Clears all markers related to the displayed routes (start, end, vehicle)
function clearRouteMarkers() {
    console.log('Clearing route markers...');
    routeMarkers.forEach(m => m.setMap(null));
    routeMarkers = [];
    console.log('Route markers cleared. Current routeMarkers array:', routeMarkers);
}

// Clears all manually drawn alternative route polylines
function clearAlternativeRoutePolylines() {
    console.log('Clearing alternative route polylines...');
    alternativeRoutePolylines.forEach(polyline => polyline.setMap(null));
    alternativeRoutePolylines = [];
    console.log('Alternative route polylines cleared. Current alternativeRoutePolylines array:', alternativeRoutePolylines);
}

// Returns the appropriate vehicle icon emoji
function getVehicleIcon(vehicleType) {
    const icons = {
        'DRIVING': '🚗',
        'BICYCLING': '🚲',
        'WALKING': '🚶',
        'TRANSIT': '🚌',
        'CARGO_SMALL': '🚐',
        'CARGO_MEDIUM': '🚚',
        'CARGO_LARGE': '🚛',
        'CARGO_REF': '🚛❄️'
    };
    return icons[vehicleType] || '🚗';
}

// Returns the color for alternative routes (yellow)
function getAltRouteColor() {
    return '#FFD700'; // Yellow color
}

// --- Simulated Carbon Footprint Calculation ---
function calculateSimulatedCarbonFootprint(distanceInMeters, durationInSeconds, cargoWeightKg, vehicleType) {
    // Simple linear model: emission = (distance * base_emission_per_meter) + (cargo_weight * emission_per_kg_per_meter)
    let baseEmissionPerMeter = 0.1; // Example: kg CO2 per meter for a light vehicle
    let emissionPerKgPerMeter = 0.0001; // Example: additional kg CO2 per kg cargo per meter

    // Adjust base emission based on vehicle type (very rough estimate)
    switch (vehicleType) {
        case 'DRIVING':
            baseEmissionPerMeter = 0.15;
            emissionPerKgPerMeter = 0.0002; // Cars are more sensitive to weight
            break;
        case 'TRANSIT':
            baseEmissionPerMeter = 0.05; // Public transport is generally more efficient per person/kg
            emissionPerKgPerMeter = 0.00005;
            break;
        case 'CARGO_SMALL':
            baseEmissionPerMeter = 0.2;
            emissionPerKgPerMeter = 0.0003;
            break;
        case 'CARGO_MEDIUM':
            baseEmissionPerMeter = 0.3;
            emissionPerKgPerMeter = 0.0004;
            break;
        case 'CARGO_LARGE':
            baseEmissionPerMeter = 0.4;
            emissionPerKgPerMeter = 0.0005;
            break;
        case 'CARGO_REF':
            baseEmissionPerMeter = 0.25; // Higher base emission due to refrigeration
            emissionPerKgPerMeter = 0.00035;
            break;
        case 'BICYCLING':
        case 'WALKING':
            return 0; // Assume zero direct carbon emission from the vehicle/person
    }

    const distanceInKm = distanceInMeters / 1000;
    let carbonFootprint = (distanceInKm * baseEmissionPerMeter) + (cargoWeightKg * emissionPerKgPerMeter * distanceInKm);

    // Add a small penalty for longer duration (simulating congestion/inefficiency)
    carbonFootprint += (durationInSeconds / 60) * 0.001; // Example: 0.001 kg CO2 per minute

    return Math.max(0, carbonFootprint);
}

// Add this function to fetch weather data
async function fetchWeatherData(lat, lon) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return null;
    }
}

// Add this function to analyze weather conditions
function analyzeWeatherConditions(weather) {
    if (!weather) return { safe: true, message: 'Weather data unavailable' };

    const conditions = {
        temperature: weather.main.temp,
        windSpeed: weather.wind.speed,
        visibility: weather.visibility,
        weatherMain: weather.weather[0].main,
        weatherDescription: weather.weather[0].description
    };

    let warnings = [];
    let isSafe = true;

    // Temperature checks
    if (conditions.temperature < 0) {
        warnings.push('Freezing conditions');
        isSafe = false;
    } else if (conditions.temperature > 35) {
        warnings.push('Extreme heat');
        isSafe = false;
    }

    // Wind speed checks
    if (conditions.windSpeed > 20) {
        warnings.push('Strong winds');
        isSafe = false;
    }

    // Visibility checks
    if (conditions.visibility < 1000) {
        warnings.push('Poor visibility');
        isSafe = false;
    }

    // Weather condition checks
    const dangerousConditions = ['Thunderstorm', 'Heavy Rain', 'Snow', 'Sleet', 'Hail'];
    if (dangerousConditions.includes(conditions.weatherMain)) {
        warnings.push(`Severe weather: ${conditions.weatherDescription}`);
        isSafe = false;
    }

    return {
        safe: isSafe,
        warnings: warnings,
        conditions: conditions
    };
}

// Modify the calculateRoute function to use ML predictions
async function calculateRoute() {
    const fromText = document.getElementById('from').value.trim();
    const toText = document.getElementById('to').value.trim();
    const vehicleType = document.getElementById('vehicle').value;
    const showAlternatives = document.getElementById('showAlternatives').checked;
    const avoidHighways = document.getElementById('avoidHighways').checked;
    const avoidTolls = document.getElementById('avoidTolls').checked;
    const cargoWeightKg = parseFloat(document.getElementById('cargoWeight').value) || 0;

    if (!fromText || !toText) {
        alert('Please enter both starting location and destination');
        return;
    }

    // Map cargo vehicle types to DRIVING mode for the API
    let apiTravelMode = vehicleType;
    if (vehicleType.startsWith('CARGO_')) {
        apiTravelMode = 'DRIVING';
    }

    const request = {
        origin: fromText,
        destination: toText,
        travelMode: google.maps.TravelMode[apiTravelMode],
        provideRouteAlternatives: showAlternatives
    };
    if (avoidHighways || avoidTolls) {
        request.avoid = [];
        if (avoidHighways) request.avoid.push(google.maps.Avoid.HIGHWAYS);
        if (avoidTolls) request.avoid.push(google.maps.Avoid.TOLLS);
    }

    // Clear previous routes and markers
    directionsRenderer.setDirections({routes: []});
    clearAlternativeRoutePolylines();
    clearRouteMarkers();

    try {
        const result = await new Promise((resolve, reject) => {
            directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    resolve(result);
                } else {
                    reject(new Error(`Directions request failed: ${status}`));
                }
            });
        });

        // Fetch weather data
        const startLocation = result.routes[0].legs[0].start_location;
        const weatherData = await fetchWeatherData(startLocation.lat(), startLocation.lng());
        const weatherAnalysis = analyzeWeatherConditions(weatherData);

        // Display weather information
        displayWeatherInfo(weatherAnalysis);

        // Get ML predictions for each route
        const routePredictions = await Promise.all(
            result.routes.map(async (route) => {
                const mlScore = await window.mlModel.predictRouteScore(
                    route.legs[0],
                    vehicleType,
                    cargoWeightKg,
                    weatherAnalysis
                );
                return { route, mlScore };
            })
        );

        // Find the best route based on ML prediction
        const bestRouteIndex = routePredictions.reduce(
            (bestIndex, current, currentIndex) => 
                current.mlScore > routePredictions[bestIndex].mlScore ? currentIndex : bestIndex,
            0
        );

        // Display routes with ML predictions
        displayRouteInfoWithML(result, routePredictions, bestRouteIndex, weatherAnalysis);

        // Display the best route
        const bestRouteResult = {
            routes: [result.routes[bestRouteIndex]],
            request: result.request
        };
        directionsRenderer.setDirections(bestRouteResult);
        animateVehicle(result.routes[bestRouteIndex].legs[0].steps, vehicleType);

        // Manually draw alternative routes
        clearAlternativeRoutePolylines(); // Clear any previous alternative lines
        result.routes.forEach((route, index) => {
            if (index !== bestRouteIndex) {
                const alternativeRoutePolyline = new google.maps.Polyline({
                    path: route.overview_path,
                    geodesic: true,
                    strokeColor: getAltRouteColor(), // Use yellow color
                    strokeOpacity: 0.7,
                    strokeWeight: 3, // Thinner line
                    icons: [{
                        icon: { path: 'M 0,-1 0,1' },
                        offset: '0',
                        repeat: '20px'
                    }], // Dashed line
                    map: map
                });
                alternativeRoutePolylines.push(alternativeRoutePolyline);
            }
        });

    } catch (error) {
        console.error('Error calculating route:', error);
        alert('Could not calculate route. Please try again.');
    }
}

// Update the displayRouteInfo function to show ML predictions
function displayRouteInfoWithML(result, routePredictions, bestRouteIndex, weatherAnalysis) {
    const routeDetails = document.getElementById('routeDetails');
    routeDetails.innerHTML = '';

    routePredictions.forEach(({ route, mlScore }, index) => {
        const leg = route.legs[0];
        const routeDiv = document.createElement('div');
        routeDiv.className = `route-details ${index === bestRouteIndex ? 'best-route' : ''}`;

        const carbonFootprint = calculateSimulatedCarbonFootprint(
            leg.distance.value,
            leg.duration.value,
            parseFloat(document.getElementById('cargoWeight').value) || 0,
            document.getElementById('vehicle').value
        );

        routeDiv.innerHTML = `
            <h4>${index === bestRouteIndex ? '🌟 Best Route (ML Recommended)' : `Route ${index + 1}`}</h4>
            <p>Distance: ${leg.distance.text}</p>
            <p>Duration: ${leg.duration.text}</p>
            <p>ML Prediction Score: ${(mlScore * 100).toFixed(1)}%</p>
            <p>Carbon Footprint: ${carbonFootprint.toFixed(2)} kg CO2e</p>
            <p>Start: ${leg.start_address}</p>
            <p>End: ${leg.end_address}</p>
            ${!weatherAnalysis.safe ? '<p class="weather-warning">⚠️ Consider weather conditions before traveling</p>' : ''}
        `;

        routeDiv.onclick = () => {
            directionsRenderer.setDirections(null);
            clearRouteMarkers();
            clearAlternativeRoutePolylines();

            const singleRouteResult = {
                routes: [route],
                request: result.request
            };
            directionsRenderer.setDirections(singleRouteResult);

            if (index === bestRouteIndex) {
                animateVehicle(leg.steps, document.getElementById('vehicle').value);
            }
        };

        routeDetails.appendChild(routeDiv);
    });
}

// Initialize ML model when the page loads
window.addEventListener('load', () => {
    window.mlModel.initializeModel().catch(console.error);
});

// Add this function to display weather information
function displayWeatherInfo(weatherAnalysis) {
    const weatherDetails = document.getElementById('weatherDetails');
    weatherDetails.innerHTML = '';

    if (!weatherAnalysis.conditions) {
        weatherDetails.innerHTML = '<p>Weather data unavailable</p>';
        return;
    }

    const conditions = weatherAnalysis.conditions;
    const weatherDiv = document.createElement('div');
    weatherDiv.className = 'weather-details';

    // Add temperature
    const tempDiv = document.createElement('div');
    tempDiv.className = 'weather-condition';
    tempDiv.innerHTML = `🌡️ ${conditions.temperature}°C`;
    weatherDiv.appendChild(tempDiv);

    // Add wind speed
    const windDiv = document.createElement('div');
    windDiv.className = 'weather-condition';
    windDiv.innerHTML = `💨 ${conditions.windSpeed} m/s`;
    weatherDiv.appendChild(windDiv);

    // Add visibility
    const visibilityDiv = document.createElement('div');
    visibilityDiv.className = 'weather-condition';
    visibilityDiv.innerHTML = `👁️ ${conditions.visibility / 1000} km`;
    weatherDiv.appendChild(visibilityDiv);

    // Add weather condition
    const weatherConditionDiv = document.createElement('div');
    weatherConditionDiv.className = 'weather-condition';
    weatherConditionDiv.innerHTML = `🌤️ ${conditions.weatherDescription}`;
    weatherDiv.appendChild(weatherConditionDiv);

    weatherDetails.appendChild(weatherDiv);

    // Add warning or safe message
    const messageDiv = document.createElement('div');
    messageDiv.className = weatherAnalysis.safe ? 'weather-safe' : 'weather-warning';
    if (weatherAnalysis.safe) {
        messageDiv.textContent = 'Weather conditions are safe for travel';
    } else {
        messageDiv.textContent = `⚠️ Weather warnings: ${weatherAnalysis.warnings.join(', ')}`;
    }
    weatherDetails.appendChild(messageDiv);
}

// Function to handle chat input
function handleChatInput() {
    const chatInput = document.getElementById('chatInput');
    const chatBox = document.getElementById('chatBox');
    const userMessage = chatInput.value.trim();

    if (userMessage) {
        // Display user message
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'chat-message user';
        userMessageDiv.textContent = userMessage;
        chatBox.appendChild(userMessageDiv);

        // Generate and display bot response
        const botResponse = generateChatResponse(userMessage);
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'chat-message bot';
        botMessageDiv.textContent = botResponse;
        chatBox.appendChild(botMessageDiv);

        // Clear input and scroll to bottom
        chatInput.value = '';
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Function to generate chatbot response based on user input
function generateChatResponse(message) {
    const lowerCaseMessage = message.toLowerCase();

    if (lowerCaseMessage.includes('route') || lowerCaseMessage.includes('direction')) {
        return "You can find the best route by entering your start and destination and clicking 'Find Route'. Alternative routes will also be displayed.";
    } else if (lowerCaseMessage.includes('weather')) {
        if (currentWeather) {
             return `The current weather in the starting location is ${currentWeather.weather[0].description} with a temperature of ${currentWeather.main.temp}°C.`;
        } else {
            return "I can provide weather information for the starting location once a route is calculated.";
        }
    } else if (lowerCaseMessage.includes('carbon footprint') || lowerCaseMessage.includes('emission')) {
        return "I calculate a simulated carbon footprint for each route based on distance, vehicle type, and cargo weight.";
    } else if (lowerCaseMessage.includes('vehicle')) {
        return "You can select different vehicle types from the dropdown to see how they affect the route and carbon footprint.";
     } else if (lowerCaseMessage.includes('hello') || lowerCaseMessage.includes('hi')) {
        return "Hello! How can I assist you with your route planning today?";
    } else if (lowerCaseMessage.includes('help')) {
        return "I can help you with questions about finding routes, weather conditions, carbon footprint calculation, and vehicle options.";
    }
    else {
        return "I'm sorry, I don't understand that. Can you please rephrase your question?";
    }
}

// Add this function to animate the vehicle along the route steps
function animateVehicle(steps, vehicleType) {
    console.log('Starting vehicle animation...');
    clearRouteMarkers(); // Ensure only one vehicle marker exists

    const vehicleIcon = getVehicleIcon(vehicleType);
    let stepIndex = 0;
    let legIndex = 0; // For future multi-leg routes
    let distance = 0; // Distance covered in the current step

    const vehicleMarker = new google.maps.Marker({
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE, // Using a circle path for now, can be changed to a custom SVG for vehicle
            scale: 8,
            fillColor: '#000000', // Black color for the vehicle marker
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        },
         label: { // Use label to display emoji
            text: vehicleIcon,
            color: '#FFFFFF', // White color for emoji
            fontSize: '14px',
             fontWeight: 'bold'
        },
        zIndex: 999 // Ensure marker is on top
    });
    routeMarkers.push(vehicleMarker); // Add to route-specific markers

    // Function to move the marker along a step
    function moveMarker() {
        if (legIndex >= steps.length) return; // Animation complete

        const step = steps[legIndex];
        const path = step.path;

        if (distance < path.length) {
            const position = path[distance];
            vehicleMarker.setPosition(position);
            distance++;
            requestAnimationFrame(moveMarker);
        } else {
            // Move to the next step
            distance = 0;
            legIndex++;
            requestAnimationFrame(moveMarker);
        }
    }

    // Start the animation
    moveMarker();
}

// Add these functions after the existing utility functions
function calculateRouteScore(route, vehicleType, cargoWeight) {
    // Base weights for different factors
    const weights = {
        distance: 0.3,
        fuelEfficiency: 0.3,
        traffic: 0.4
    };

    // Get base metrics
    const distance = route.distance.value / 1000; // Convert to km
    const duration = route.duration.value / 60; // Convert to minutes
    const trafficLevel = route.duration_in_traffic ? 
        (route.duration_in_traffic.value / route.duration.value) : 1;

    // Calculate fuel consumption based on vehicle type and cargo
    const fuelConsumption = calculateFuelConsumption(distance, vehicleType, cargoWeight);

    // Normalize metrics to 0-1 scale (lower is better)
    const normalizedDistance = 1 - (distance / 100); // Assuming max 100km
    const normalizedFuel = 1 - (fuelConsumption / 20); // Assuming max 20L
    const normalizedTraffic = 1 - (trafficLevel - 1); // Traffic multiplier

    // Calculate weighted score
    const score = (
        normalizedDistance * weights.distance +
        normalizedFuel * weights.fuelEfficiency +
        normalizedTraffic * weights.traffic
    );

    return {
        score,
        metrics: {
            distance,
            fuelConsumption,
            trafficLevel,
            duration
        }
    };
}

function calculateFuelConsumption(distance, vehicleType, cargoWeight) {
    // Base fuel consumption rates (L/100km)
    const baseRates = {
        'DRIVING': 7.5,
        'BICYCLING': 0,
        'TRANSIT': 2.5,
        'WALKING': 0,
        'CARGO_SMALL': 10,
        'CARGO_MEDIUM': 15,
        'CARGO_LARGE': 20,
        'CARGO_REF': 12
    };

    // Cargo weight impact (additional L/100km per ton)
    const cargoImpact = {
        'CARGO_SMALL': 2,
        'CARGO_MEDIUM': 3,
        'CARGO_LARGE': 4,
        'CARGO_REF': 2.5
    };

    let consumption = baseRates[vehicleType] || 0;
    
    // Add cargo impact for cargo vehicles
    if (vehicleType.startsWith('CARGO')) {
        const cargoTons = cargoWeight / 1000;
        consumption += cargoTons * (cargoImpact[vehicleType] || 0);
    }

    return (consumption * distance) / 100;
}

// Modify the displayRouteInfo function
function displayRouteInfo(result, bestRouteIndex, weatherAnalysis) {
    const routeDetails = document.getElementById('routeDetails');
    routeDetails.innerHTML = ''; // Clear previous details

    result.routes.forEach((route, index) => {
        const leg = route.legs[0];
        const routeDiv = document.createElement('div');
        routeDiv.className = 'route-details';
        
        // Add class for highlighting the best route
        if (index === bestRouteIndex) {
            routeDiv.classList.add('best-route');
        }

        // Custom labeling for routes
        let routeName;
        if (index === 0) {
            routeName = 'Best Route';
        } else {
            routeName = `Route ${index + 1}`;
        }

        routeDiv.innerHTML = `
            <h4 style="color: #4CAF50;">${routeName}</h4>
            <p>Distance: ${leg.distance.text}</p>
            <p>Duration: ${leg.duration.text}</p>
            <p>Simulated Carbon Footprint: ${route.carbonFootprint.toFixed(2)} kg CO2e</p>
            <p>Start: ${leg.start_address}</p>
            <p>End: ${leg.end_address}</p>
            ${!weatherAnalysis.safe ? '<p class="weather-warning">⚠️ Consider weather conditions before traveling</p>' : ''}
        `;
        routeDetails.appendChild(routeDiv);
    });
} 