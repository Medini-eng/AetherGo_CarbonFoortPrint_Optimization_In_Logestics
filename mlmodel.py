import requests
import pandas as pd
import numpy as np
import folium
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
from dotenv import load_dotenv
import polyline

GOOGLE_MAPS_API_KEY = 'AIzaSyBioNumne6VPJfJYZfp-hg7PmSPFPajiOA'
OPENWEATHER_API_KEY = '18ad061e17d13402d9ba4a174ba6043a'

origin = "Delhi"
destination = "Agra"


print("Maps Key:", GOOGLE_MAPS_API_KEY)
print("Weather Key:", OPENWEATHER_API_KEY)



# -------------------- CONFIG --------------------
load_dotenv()
GOOGLE_MAPS_API_KEY = os.getenv(GOOGLE_MAPS_API_KEY)
OPENWEATHER_API_KEY = os.getenv(OPENWEATHER_API_KEY)

def get_routes(origin, destination):
    url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin}&destination={destination}&alternatives=true&key={GOOGLE_MAPS_API_KEY}"
    response = requests.get(url)
    
    if response.status_code != 200:
        print(f"❌ Google Maps API error: {response.status_code}")
        return []

    result = response.json()
    
    if result.get("status") != "OK":
        print(f"❌ Google Maps API response status: {result.get('status')}")
        print("Details:", result.get("error_message", "No error message provided."))
        return []

    routes = result.get('routes', [])
    route_data = []
    
    for route in routes:
        legs = route['legs'][0]
        route_data.append({
            'distance_km': legs['distance']['value'] / 1000,
            'duration_min': legs['duration']['value'] / 60,
            'start_location': legs['start_location'],
            'end_location': legs['end_location'],
            'polyline': route['overview_polyline']['points']
        })
    return route_data

def get_weather(lat, lon):
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
    response = requests.get(url).json()
    main = response.get('main', {})
    weather = response.get('weather', [{}])[0]
    return {
        'temperature': main.get('temp', 0),
        'weather_condition': weather.get('main', 'Clear')
    }
print("Testing route fetching...")
routes = get_routes(origin, destination)
print(f"Fetched {len(routes)} routes.")
print(routes)
weather = get_weather(40.7128, -74.0060)  # New York
print("Sample weather:", weather)
def simulate_fuel_consumption(distance_km, duration_min, cargo_weight_kg):
    return 0.1 * distance_km + 0.0005 * cargo_weight_kg * distance_km + 0.05 * duration_min

def condition_to_score(condition):
    return {'Clear': 0, 'Clouds': 1, 'Rain': 2, 'Snow': 3, 'Thunderstorm': 4}.get(condition, 0)

def create_dataset(origin, destination, num_samples=20):
    data = []
    for _ in range(num_samples):
        cargo_weight = np.random.randint(500, 10000)
        routes = get_routes(origin, destination)
        if not routes:
            print("⚠️ No routes found. Skipping sample.")
            continue
        for route in routes:
            weather = get_weather(route['start_location']['lat'], route['start_location']['lng'])
            fuel = simulate_fuel_consumption(route['distance_km'], route['duration_min'], cargo_weight)
            score = route['duration_min'] * 0.5 + fuel * 0.4 + condition_to_score(weather['weather_condition']) * 0.1
            data.append({
                'distance_km': route['distance_km'],
                'duration_min': route['duration_min'],
                'temperature': weather['temperature'],
                'weather_condition_score': condition_to_score(weather['weather_condition']),
                'cargo_weight_kg': cargo_weight,
                'fuel_consumed_liters': fuel,
                'route_score': score
            })
    if not data:
        raise ValueError("No data generated. Check route or weather API responses.")
    df = pd.DataFrame(data)
    df.to_excel("route_dataset.xlsx", index=False)
    return df

def train_model(df):
    features = ['distance_km', 'duration_min', 'temperature', 'weather_condition_score', 'cargo_weight_kg']
    for col in features:
        if col not in df.columns:
            raise ValueError(f"Missing column in dataset: {col}")
    X = df[features]
    y = df['route_score']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    print("Model MSE:", mean_squared_error(y_test, model.predict(X_test)))
    return model

def predict_best_route(model, origin, destination, cargo_weight):
    routes = get_routes(origin, destination)
    if not routes:
        raise ValueError("No routes available for prediction.")
    predictions = []
    for route in routes:
        weather = get_weather(route['start_location']['lat'], route['start_location']['lng'])
        features = {
            'distance_km': route['distance_km'],
            'duration_min': route['duration_min'],
            'temperature': weather['temperature'],
            'weather_condition_score': condition_to_score(weather['weather_condition']),
            'cargo_weight_kg': cargo_weight
        }
        score = model.predict([list(features.values())])[0]
        predictions.append((score, route))
    predictions.sort()
    return predictions[0][1], predictions

def draw_routes_on_map(predictions):
    if not predictions:
        print("No predictions to draw.")
        return
    map_center = [predictions[0][1]['start_location']['lat'], predictions[0][1]['start_location']['lng']]
    m = folium.Map(location=map_center, zoom_start=10)
    colors = ['blue', 'green', 'orange', 'red', 'purple']
    for idx, (score, route) in enumerate(predictions):
        points = polyline.decode(route['polyline'])
        fuel = simulate_fuel_consumption(route['distance_km'], route['duration_min'], 3000)
        tooltip = f"Score: {score:.2f}, Time: {route['duration_min']:.1f} min, Fuel: {fuel:.2f} L"
        folium.PolyLine(points, color=colors[idx % len(colors)], weight=5, tooltip=tooltip).add_to(m)
    m.save("route_map.html")

# -------------------- MAIN --------------------
if __name__ == '__main__':
    origin = 'New York, NY'
    destination = 'Philadelphia, PA'

    print("📦 Creating dataset...")
    df = create_dataset(origin, destination)

    print("🤖 Training model...")
    model = train_model(df)

    print("📍 Predicting best route...")
    best_route, all_routes = predict_best_route(model, origin, destination, cargo_weight=3000)

    print("🗺️ Drawing routes on map...")
    draw_routes_on_map(all_routes)

    print("✅ Map saved to route_map.html")
