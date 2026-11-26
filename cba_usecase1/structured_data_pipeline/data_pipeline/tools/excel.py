import pandas as pd
from pathlib import Path
from typing import Optional
from datetime import datetime
try:
    from ..constants import COMMONWEALTH_BANK_USER_COMMENT_TABLE
except ImportError:
    from constants import COMMONWEALTH_BANK_USER_COMMENT_TABLE


def read_excel_file(file_path: str, sheet_name: str = COMMONWEALTH_BANK_USER_COMMENT_TABLE) -> pd.DataFrame:
    """
    Read an Excel file and return as a DataFrame.
    
    Args:
        file_path: Path to the Excel file
        
    Returns:
        DataFrame containing the Excel data
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        ValueError: If the file cannot be read as Excel
    """
    path = Path(file_path)
    
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if path.suffix.lower() not in ['.xlsx', '.xls']:
        raise ValueError(f"File must be an Excel file (.xlsx or .xls), got {path.suffix}")
    
    try:
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        return df
    except Exception as e:
        raise ValueError(f"Error reading Excel file: {str(e)}")


def extract_year(date_value) -> Optional[int]:
    """
    Extract year from various date formats.
    
    Args:
        date_value: Date value (can be datetime, string, or timestamp)
        
    Returns:
        Integer year value, or None if extraction fails
    """
    if date_value is None or pd.isna(date_value):
        return None
    
    # If already a datetime object
    if isinstance(date_value, datetime):
        return date_value.year
    
    # If it's a pandas Timestamp
    if isinstance(date_value, pd.Timestamp):
        return date_value.year
    
    # If it's a string, try to parse it
    if isinstance(date_value, str):
        try:
            parsed_date = pd.to_datetime(date_value)
            return parsed_date.year
        except (ValueError, TypeError):
            return None
    
    return None


def add_year_column(df: pd.DataFrame, date_column: str) -> pd.DataFrame:
    """
    Add a year column extracted from a date column.
    
    Args:
        df: Input DataFrame
        date_column: Name of the column containing dates
        
    Returns:
        DataFrame with added 'year' column
        
    Raises:
        KeyError: If date_column doesn't exist
    """
    if date_column not in df.columns:
        raise KeyError(f"Column '{date_column}' not found in DataFrame")
    
    df['year'] = df[date_column].apply(extract_year)
    return df
