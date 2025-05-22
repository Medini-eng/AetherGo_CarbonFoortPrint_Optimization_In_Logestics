// ML Model for Route Prediction
let model;
let isModelTrained = false;

// Initialize and train the model
async function initializeModel() {
    // Create a sequential model
    model = tf.sequential();
    
    // Add layers
    model.add(tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [7] // Input features: distance, duration, traffic, weather, vehicle type, cargo weight, time of day
    }));
    
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu'
    }));
    
    model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid' // Output: route score between 0 and 1
    }));

    // Compile the model
    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['accuracy']
    });

    // Train the model with some initial data
    await trainModel();
}

// Function to train the model with historical data
async function trainModel() {
    // Generate synthetic training data
    const trainingData = generateTrainingData();
    
    // Convert to tensors
    const xs = tf.tensor2d(trainingData.inputs);
    const ys = tf.tensor2d(trainingData.outputs, [trainingData.outputs.length, 1]);

    // Train the model
    await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
            }
        }
    });

    isModelTrained = true;
    console.log('Model training completed');
}

// Generate synthetic training data
function generateTrainingData() {
    const numSamples = 1000;
    const inputs = [];
    const outputs = [];

    for (let i = 0; i < numSamples; i++) {
        // Generate random input features
        const distance = Math.random() * 100; // 0-100 km
        const duration = Math.random() * 120; // 0-120 minutes
        const traffic = Math.random(); // 0-1
        const weather = Math.random(); // 0-1
        const vehicleType = Math.random(); // 0-1
        const cargoWeight = Math.random() * 5000; // 0-5000 kg
        const timeOfDay = Math.random(); // 0-1

        // Calculate a synthetic score based on these features
        const score = calculateSyntheticScore(
            distance, duration, traffic, weather, 
            vehicleType, cargoWeight, timeOfDay
        );

        inputs.push([distance, duration, traffic, weather, vehicleType, cargoWeight, timeOfDay]);
        outputs.push([score]);
    }

    console.log('Generated synthetic training data:', { inputs: inputs.slice(0, 5), outputs: outputs.slice(0, 5) }); // Log a few samples
    const maxScore = Math.max(...outputs.map(o => o[0]));
    const minScore = Math.min(...outputs.map(o => o[0]));
    console.log('Synthetic score range:', { min: minScore, max: maxScore });

    return { inputs, outputs };
}

// Calculate synthetic score for training data
function calculateSyntheticScore(distance, duration, traffic, weather, vehicleType, cargoWeight, timeOfDay) {
    // Normalize inputs (lower is generally better, so subtract from 1)
    const normalizedDistance = 1 - (distance / 100);
    const normalizedDuration = 1 - (duration / 120);
    const normalizedTraffic = 1 - traffic; // Assuming higher traffic is worse
    const normalizedWeather = 1 - weather; // Assuming higher weather value implies worse conditions
    const normalizedCargo = 1 - (cargoWeight / 5000);

    // Simple scoring based on normalized features (higher is better)
    let score = (
        normalizedDistance * 0.4 + // More weight to distance
        normalizedDuration * 0.3 + // More weight to duration
        normalizedTraffic * 0.2 +  // Moderate weight to traffic
        normalizedWeather * 0.05 + // Less weight to weather (can be unpredictable)
        (1 - Math.abs(vehicleType - 0.5)) * 0.05 + // Prefer 'middle' vehicle types synthetically
        normalizedCargo * 0.05 + // Less weight to cargo (linear impact assumed elsewhere)
        (1 - Math.abs(timeOfDay - 0.5)) * 0.05 // Prefer 'middle' of the day synthetically
    );

    // Add some randomness to simulate real-world variability
    score += (Math.random() - 0.5) * 0.1; // Add noise between -0.05 and 0.05

    // Clamp score between 0 and 1
    return Math.max(0, Math.min(1, score));
}

// Predict route score using the trained model
async function predictRouteScore(route, vehicleType, cargoWeight, weatherData) {
    if (!isModelTrained) {
        await initializeModel();
    }

    // Prepare input features
    const distance = route.distance.value / 1000; // Convert to km
    const duration = route.duration.value / 60; // Convert to minutes
    const traffic = route.duration_in_traffic ? 
        (route.duration_in_traffic.value / route.duration.value) : 1;
    const weather = weatherData ? (1 - (weatherData.warnings.length / 5)) : 0.5;
    const vehicleTypeNorm = getVehicleTypeNormalized(vehicleType);
    const cargoWeightNorm = cargoWeight / 5000;
    const timeOfDay = new Date().getHours() / 24;

    // Create input tensor
    const input = tf.tensor2d([[
        distance,
        duration,
        traffic,
        weather,
        vehicleTypeNorm,
        cargoWeightNorm,
        timeOfDay
    ]]);

    // Make prediction
    const prediction = model.predict(input);
    const score = await prediction.data();

    // Clean up tensors
    input.dispose();
    prediction.dispose();

    return score[0];
}

// Helper function to normalize vehicle type
function getVehicleTypeNormalized(vehicleType) {
    const vehicleTypes = {
        'DRIVING': 0.2,
        'BICYCLING': 0.8,
        'TRANSIT': 0.6,
        'WALKING': 1.0,
        'CARGO_SMALL': 0.4,
        'CARGO_MEDIUM': 0.3,
        'CARGO_LARGE': 0.2,
        'CARGO_REF': 0.25
    };
    return vehicleTypes[vehicleType] || 0.5;
}

// Export functions
window.mlModel = {
    initializeModel,
    predictRouteScore
}; 