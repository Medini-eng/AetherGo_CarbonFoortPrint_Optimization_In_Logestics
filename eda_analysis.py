import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Set style for better visualizations
plt.style.use('default')
sns.set_theme()

def load_data():
    """Load all relevant datasets"""
    try:
        route_df = pd.read_csv('dataset/route_dataset.csv')
        cities_df = pd.read_csv('dataset/cities.csv')
        world_cities_df = pd.read_csv('dataset/worldcities.csv')
        states_df = pd.read_csv('dataset/states.csv')
        return route_df, cities_df, world_cities_df, states_df
    except Exception as e:
        print(f"Error loading data: {str(e)}")
        return None, None, None, None

def analyze_route_dataset(df):
    """Perform EDA on the route dataset"""
    print("\n=== Route Dataset Analysis ===")
    
    # Basic information
    print("\nDataset Info:")
    print(df.info())
    
    print("\nBasic Statistics:")
    print(df.describe())
    
    print("\nMissing Values:")
    print(df.isnull().sum())
    
    # Create visualizations directory if it doesn't exist
    Path("visualizations").mkdir(exist_ok=True)
    
    # Distribution of numerical variables
    numerical_cols = df.select_dtypes(include=[np.number]).columns
    for col in numerical_cols:
        plt.figure(figsize=(10, 6))
        sns.histplot(data=df, x=col, kde=True)
        plt.title(f'Distribution of {col}')
        plt.savefig(f'visualizations/{col}_distribution.png')
        plt.close()
    
    # Correlation analysis
    plt.figure(figsize=(12, 8))
    correlation_matrix = df.select_dtypes(include=[np.number]).corr()
    sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm', center=0)
    plt.title('Correlation Matrix')
    plt.tight_layout()
    plt.savefig('visualizations/correlation_matrix.png')
    plt.close()
    
    # Categorical variables analysis
    categorical_cols = df.select_dtypes(include=['object']).columns
    for col in categorical_cols:
        plt.figure(figsize=(10, 6))
        value_counts = df[col].value_counts()
        sns.barplot(x=value_counts.index, y=value_counts.values)
        plt.title(f'Distribution of {col}')
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig(f'visualizations/{col}_distribution.png')
        plt.close()

def analyze_cities_data(cities_df, world_cities_df):
    """Analyze cities datasets"""
    print("\n=== Cities Data Analysis ===")
    
    # Basic information
    print("\nCities Dataset Info:")
    print(cities_df.info())
    
    print("\nWorld Cities Dataset Info:")
    print(world_cities_df.info())
    
    # Population distribution
    plt.figure(figsize=(12, 6))
    sns.histplot(data=world_cities_df, x='population', bins=50)
    plt.title('Population Distribution of Cities')
    plt.xscale('log')
    plt.savefig('visualizations/city_population_distribution.png')
    plt.close()
    
    # Geographic distribution
    plt.figure(figsize=(12, 8))
    plt.scatter(world_cities_df['lng'], world_cities_df['lat'], 
                alpha=0.1, s=world_cities_df['population']/100000)
    plt.title('Geographic Distribution of Cities')
    plt.xlabel('Longitude')
    plt.ylabel('Latitude')
    plt.savefig('visualizations/city_geographic_distribution.png')
    plt.close()

def main():
    # Load data
    route_df, cities_df, world_cities_df, states_df = load_data()
    
    if route_df is not None:
        analyze_route_dataset(route_df)
    
    if cities_df is not None and world_cities_df is not None:
        analyze_cities_data(cities_df, world_cities_df)
    
    print("\nEDA completed. Visualizations have been saved in the 'visualizations' directory.")

if __name__ == "__main__":
    main() 