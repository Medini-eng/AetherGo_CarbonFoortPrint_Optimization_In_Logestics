import tkinter as tk
from tkinter import ttk, messagebox
import folium
import webbrowser
import pandas as pd
import numpy as np
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_squared_error
import joblib
import requests
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# API Keys
OPENWEATHER_API_KEY = "cb2b4f87fa25e08b86c6f97bd90eaa38"
GOOGLE_MAPS_API_KEY = "AIzaSyBobXcuUZASeR_hFSjexA2gXKM09vnEmQo"

# --- Helper Functions ---

def get_coordinates(city_name):
    try:
        geolocator = Nominatim(user_agent="eco_route_app")
        location = geolocator.geocode(city_name)
        if location is None:
            raise ValueError(f"Could not find coordinates for {city_name}")
        return (location.latitude, location.longitude)
    except (GeocoderTimedOut, GeocoderUnavailable) as e:
        raise ConnectionError(f"Geocoding service error: {str(e)}")

def calculate_distance(coord1, coord2):
    try:
        return geodesic(coord1, coord2).km
    except Exception as e:
        raise ValueError(f"Error calculating distance: {str(e)}")

def get_google_route(origin, destination, api_key=GOOGLE_MAPS_API_KEY):
    try:
        # Format coordinates properly for Google Maps API
        origin_str = f"{origin[0]:.6f},{origin[1]:.6f}"
        dest_str = f"{destination[0]:.6f},{destination[1]:.6f}"
        
        url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin_str}&destination={dest_str}&key={api_key}"
        response = requests.get(url).json()
        
        if response['status'] == 'ZERO_RESULTS':
            # If no route found, try with a small offset to find nearest road
            offset = 0.001  # approximately 100 meters
            origin_str = f"{origin[0] + offset:.6f},{origin[1] + offset:.6f}"
            dest_str = f"{destination[0] + offset:.6f},{destination[1] + offset:.6f}"
            url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin_str}&destination={dest_str}&key={api_key}"
            response = requests.get(url).json()
        
        if response['status'] != 'OK':
            raise ValueError(f"Google Maps API error: {response['status']} - {response.get('error_message', 'No error message')}")
            
        route = response['routes'][0]['legs'][0]
        return {
            'distance': route['distance']['value'] / 1000,  # Convert to km
            'duration': route['duration']['value'] / 60,    # Convert to minutes
            'steps': route['steps']
        }
    except Exception as e:
        print(f"Detailed Google Maps API error: {str(e)}")
        raise RuntimeError(f"Error getting route from Google Maps: {str(e)}")

def get_weather(lat, lon):
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        response = requests.get(url).json()
        
        if response.get('cod') != 200:
            raise ValueError(f"OpenWeather API error: {response.get('message', 'Unknown error')}")
            
        main = response.get('main', {})
        weather = response.get('weather', [{}])[0]
        wind = response.get('wind', {})
        return {
            'temperature': main.get('temp', 20),
            'weather_condition': weather.get('main', 'Clear'),
            'humidity': main.get('humidity', 50),
            'wind_speed': wind.get('speed', 5)
        }
    except Exception as e:
        print(f"Weather API error: {str(e)}")
        return {'temperature': 20, 'weather_condition': 'Clear', 'humidity': 50, 'wind_speed': 5}

def condition_to_score(condition):
    return {'Clear': 0, 'Clouds': 1, 'Rain': 2, 'Snow': 3, 'Thunderstorm': 4}.get(condition, 0)

def train_and_evaluate_model():
    try:
        if os.path.exists("route_dataset.csv"):
            df = pd.read_csv("route_dataset.csv")
            features = ['distance_km', 'duration_min', 'temperature', 'weather_condition_score', 'cargo_weight_kg']
            X = df[features]
            y = df['route_score']
            
            # Split data for evaluation
            from sklearn.model_selection import train_test_split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            
            # Train model
            model = RandomForestRegressor(n_estimators=100, random_state=42)
            model.fit(X_train, y_train)
            
            # Evaluate model
            y_pred = model.predict(X_test)
            r2 = r2_score(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            
            # Save model
            joblib.dump(model, "route_model.joblib")
            
            return model, r2, rmse
        return None, None, None
    except Exception as e:
        raise RuntimeError(f"Error in model training: {str(e)}")

def predict_best_route(distance, cargo_type, cargo_weight):
    try:
        model_path = "route_model.joblib"
        if os.path.exists(model_path):
            model = joblib.load(model_path)
        else:
            model, _, _ = train_and_evaluate_model()
            if model is None:
                return "Route A (via highway)" if distance < 1000 else "Route B (eco)"

        weather = get_weather(40.7128, -74.0060)
        
        features = pd.DataFrame({
            'distance_km': [distance],
            'duration_min': [distance * 0.7],
            'temperature': [weather['temperature']],
            'weather_condition_score': [condition_to_score(weather['weather_condition'])],
            'cargo_weight_kg': [cargo_weight]
        })
        
        prediction = model.predict(features)[0]
        return "Route A (via highway)" if prediction < 200 else "Route B (eco)"
    except Exception as e:
        raise RuntimeError(f"Error in route prediction: {str(e)}")

def calculate_emissions(distance, cargo_type, cargo_weight):
    try:
        base_emission = 0.2
        weight_factor = 0.001
        type_factor = {
            'general': 1.0,
            'perishable': 1.2,
            'hazardous': 1.5
        }
        
        emissions = distance * base_emission * (1 + weight_factor * cargo_weight) * type_factor.get(cargo_type, 1.0)
        return round(emissions, 2)
    except Exception as e:
        raise ValueError(f"Error calculating emissions: {str(e)}")

def generate_map(coord1, coord2, route_name, google_route=None):
    try:
        # Create map data for web interface
        map_data = {
            'source': route_name.split(' to ')[0],
            'destination': route_name.split(' to ')[1],
            'distance': google_route['distance'] if google_route else calculate_distance(coord1, coord2),
            'duration': google_route['duration'] if google_route else calculate_distance(coord1, coord2) * 0.7,
            'route': route_name,
            'coordinates': {
                'source': coord1,
                'destination': coord2,
                'route': None
            },
            'weather_source': get_weather(coord1[0], coord1[1]),
            'weather_destination': get_weather(coord2[0], coord2[1]),
            'emissions': calculate_emissions(
                google_route['distance'] if google_route else calculate_distance(coord1, coord2),
                'general',  # Default cargo type
                1000  # Default weight
            ),
            'cargo_type': 'general',
            'weight': 1000,
            'model_r2': 0.85,  # Example model performance
            'model_rmse': 0.15
        }

        # Add route coordinates if available
        if google_route and 'steps' in google_route:
            route_coords = []
            for step in google_route['steps']:
                start = step['start_location']
                end = step['end_location']
                route_coords.append([start['lat'], start['lng']])
                route_coords.append([end['lat'], end['lng']])
            map_data['coordinates']['route'] = route_coords

        # Save map data to JSON file
        with open('route_data.json', 'w') as f:
            json.dump(map_data, f)

        # Open the web interface
        webbrowser.open('http://localhost:8000/route_display.html')
    except Exception as e:
        raise RuntimeError(f"Error generating map: {str(e)}")

# --- GUI Code ---

class EcoRouteApp:
    def __init__(self, root):
        self.root = root
        self.root.title("EcoRoute Navigator")
        self.root.geometry("600x800")
        self.model_accuracy = None
        self.setup_gui()
        
    def setup_gui(self):
        # Create main frame with padding
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Input Section
        input_frame = ttk.LabelFrame(main_frame, text="Input Parameters", padding="10")
        input_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # Source City
        ttk.Label(input_frame, text="Source City").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.entry_src = ttk.Entry(input_frame, width=30)
        self.entry_src.grid(row=0, column=1, pady=5)
        
        # Destination City
        ttk.Label(input_frame, text="Destination City").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.entry_dst = ttk.Entry(input_frame, width=30)
        self.entry_dst.grid(row=1, column=1, pady=5)
        
        # Cargo Type
        ttk.Label(input_frame, text="Cargo Type").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.cargo_type = ttk.Combobox(input_frame, values=["general", "perishable", "hazardous"], width=27)
        self.cargo_type.grid(row=2, column=1, pady=5)
        self.cargo_type.set("general")
        
        # Cargo Weight
        ttk.Label(input_frame, text="Cargo Weight (kg)").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.entry_weight = ttk.Entry(input_frame, width=30)
        self.entry_weight.grid(row=3, column=1, pady=5)
        
        # Calculate Button
        ttk.Button(input_frame, text="Calculate Route", command=self.on_submit).grid(row=4, column=0, columnspan=2, pady=10)
        
        # Results Section
        results_frame = ttk.LabelFrame(main_frame, text="Route Information", padding="10")
        results_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # Route Details
        self.route_details = tk.StringVar()
        route_label = ttk.Label(results_frame, textvariable=self.route_details, wraplength=550)
        route_label.grid(row=0, column=0, pady=5)
        
        # Weather Information
        weather_frame = ttk.LabelFrame(main_frame, text="Weather Information", padding="10")
        weather_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        self.weather_info = tk.StringVar()
        weather_label = ttk.Label(weather_frame, textvariable=self.weather_info, wraplength=550)
        weather_label.grid(row=0, column=0, pady=5)
        
        # Emissions Information
        emissions_frame = ttk.LabelFrame(main_frame, text="Environmental Impact", padding="10")
        emissions_frame.grid(row=3, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        self.emissions_info = tk.StringVar()
        emissions_label = ttk.Label(emissions_frame, textvariable=self.emissions_info, wraplength=550)
        emissions_label.grid(row=0, column=0, pady=5)
        
        # Model Accuracy Information
        accuracy_frame = ttk.LabelFrame(main_frame, text="Model Performance", padding="10")
        accuracy_frame.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        self.accuracy_info = tk.StringVar()
        accuracy_label = ttk.Label(accuracy_frame, textvariable=self.accuracy_info, wraplength=550)
        accuracy_label.grid(row=0, column=0, pady=5)
        
        # Status Bar
        self.status_var = tk.StringVar()
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN)
        status_bar.grid(row=5, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # Initialize model accuracy
        self.update_model_accuracy()
        
    def update_model_accuracy(self):
        try:
            _, r2, rmse = train_and_evaluate_model()
            if r2 is not None and rmse is not None:
                self.accuracy_info.set(f"Model Performance:\nR² Score: {r2:.4f}\nRMSE: {rmse:.4f}")
            else:
                self.accuracy_info.set("Model Performance: No training data available")
        except Exception as e:
            self.accuracy_info.set(f"Model Performance: Error - {str(e)}")
        
    def validate_inputs(self):
        if not self.entry_src.get().strip():
            raise ValueError("Please enter source city")
        if not self.entry_dst.get().strip():
            raise ValueError("Please enter destination city")
        if not self.cargo_type.get():
            raise ValueError("Please select cargo type")
        try:
            weight = float(self.entry_weight.get())
            if weight <= 0:
                raise ValueError("Cargo weight must be positive")
        except ValueError:
            raise ValueError("Please enter a valid cargo weight")
        
    def on_submit(self):
        try:
            self.status_var.set("Calculating...")
            self.root.update()
            
            self.validate_inputs()
            
            src = self.entry_src.get().strip()
            dst = self.entry_dst.get().strip()
            cargo = self.cargo_type.get()
            weight = float(self.entry_weight.get())
            
            # Get coordinates
            coord1 = get_coordinates(src)
            coord2 = get_coordinates(dst)
            
            # Get Google Maps route
            try:
                google_route = get_google_route(coord1, coord2)
                dist = google_route['distance']
                duration = google_route['duration']
                route_available = True
            except Exception as e:
                print(f"Google Maps API error: {str(e)}")
                dist = calculate_distance(coord1, coord2)
                duration = dist * 0.7
                route_available = False
            
            # Get weather information
            weather_src = get_weather(coord1[0], coord1[1])
            weather_dst = get_weather(coord2[0], coord2[1])
            
            # Calculate route and emissions
            route = predict_best_route(dist, cargo, weight)
            emissions = calculate_emissions(dist, cargo, weight)
            
            # Update route details
            route_text = f"Route Details:\n"
            route_text += f"Source: {src} ({coord1[0]:.4f}, {coord1[1]:.4f})\n"
            route_text += f"Destination: {dst} ({coord2[0]:.4f}, {coord2[1]:.4f})\n"
            route_text += f"Distance: {dist:.2f} km\n"
            route_text += f"Duration: {duration:.0f} minutes\n"
            route_text += f"Recommended Route: {route}"
            if not route_available:
                route_text += "\nNote: Using estimated distance (Google Maps route not available)"
            self.route_details.set(route_text)
            
            # Update weather information
            weather_text = f"Weather Conditions:\n"
            weather_text += f"Source ({src}):\n"
            weather_text += f"  Temperature: {weather_src['temperature']}°C\n"
            weather_text += f"  Condition: {weather_src['weather_condition']}\n"
            weather_text += f"  Humidity: {weather_src['humidity']}%\n"
            weather_text += f"  Wind Speed: {weather_src['wind_speed']} m/s\n\n"
            weather_text += f"Destination ({dst}):\n"
            weather_text += f"  Temperature: {weather_dst['temperature']}°C\n"
            weather_text += f"  Condition: {weather_dst['weather_condition']}\n"
            weather_text += f"  Humidity: {weather_dst['humidity']}%\n"
            weather_text += f"  Wind Speed: {weather_dst['wind_speed']} m/s"
            self.weather_info.set(weather_text)
            
            # Update emissions information
            emissions_text = f"Environmental Impact:\n"
            emissions_text += f"Total CO₂ Emissions: {emissions:.2f} kg\n"
            emissions_text += f"Cargo Type Impact Factor: {cargo} ({'1.0x' if cargo == 'general' else '1.2x' if cargo == 'perishable' else '1.5x'})\n"
            emissions_text += f"Distance Impact: {dist:.2f} km\n"
            emissions_text += f"Weight Impact: {weight} kg"
            self.emissions_info.set(emissions_text)
            
            # Generate and show map
            generate_map(coord1, coord2, f"{src} to {dst}", google_route if route_available else None)
            self.status_var.set("Calculation complete")
            
        except Exception as e:
            messagebox.showerror("Error", str(e))
            self.status_var.set("Error occurred")
        finally:
            self.root.update()

if __name__ == "__main__":
    root = tk.Tk()
    app = EcoRouteApp(root)
    root.mainloop()
