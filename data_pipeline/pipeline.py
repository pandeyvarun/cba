"""
Data pipeline for processing Commonwealth Bank user comments.
Reads Excel file, filters data from 2025 onwards and classifies the comments with an LLM.
"""

import argparse
import asyncio
import sys
import pandas as pd
from pathlib import Path
try:
    from .tools import read_excel_file, add_year_column, extract_year
    from .tools.classifier import add_categories
    from .tools.llm import create_client
    from .constants import (
        COMMENT_COLUMN, COMMONWEALTH_BANK_USER_COMMENT_TABLE, DATE_COLUMN, INPUT_DIR_NAME,
        INPUT_FILE_NAME, INPUT_SHEET_NAME, OUTPUT_DIR_NAME, OUTPUT_FILE_NAME,
    )
except ImportError:
    from tools import read_excel_file, add_year_column, extract_year
    from tools.classifier import add_categories
    from tools.llm import create_client
    from constants import (
        COMMENT_COLUMN, COMMONWEALTH_BANK_USER_COMMENT_TABLE, DATE_COLUMN, INPUT_DIR_NAME,
        INPUT_FILE_NAME, INPUT_SHEET_NAME, OUTPUT_DIR_NAME, OUTPUT_FILE_NAME,
    )


class DataPipeline:
    """Pipeline for reading, filtering and classifying Excel data."""

    def __init__(self, file_path: str, date_column: str = 'date', sheet_name: str = COMMONWEALTH_BANK_USER_COMMENT_TABLE):
        """
        Initialize the data pipeline.

        Args:
            file_path: Path to the Excel file
            date_column: Name of the column containing dates (default: 'date')
            sheet_name: Name of the Excel sheet to read
        """
        self.file_path = file_path
        self.date_column = date_column
        self.sheet_name = sheet_name
        self.df = None
        self.filtered_df = None

    def read_data(self) -> pd.DataFrame:
        """
        Read data from Excel file.

        Returns:
            DataFrame containing the data
        """
        self.df = read_excel_file(self.file_path, self.sheet_name)
        print(f"✓ Read {len(self.df)} records from {self.file_path}")
        print(f"  Columns: {list(self.df.columns)}")
        return self.df

    def add_year_extraction(self) -> pd.DataFrame:
        """
        Add year column to the DataFrame.

        Returns:
            DataFrame with year column
        """
        if self.df is None:
            raise ValueError("Must call read_data() first")

        self.df = add_year_column(self.df, self.date_column)
        print(f"✓ Added 'year' column extracted from '{self.date_column}'")
        return self.df

    def filter_from_year(self, year: int = 2025) -> pd.DataFrame:
        """
        Filter data to include only records from specified year onwards.

        Args:
            year: Starting year (default: 2025)

        Returns:
            Filtered DataFrame
        """
        if self.df is None:
            raise ValueError("Must call read_data() first")

        if 'year' not in self.df.columns:
            raise ValueError("Must call add_year_extraction() first")

        # Remove rows with no year value
        df_with_years = self.df.dropna(subset=['year'])

        # Filter for years >= specified year
        self.filtered_df = df_with_years[df_with_years['year'] >= year].copy()

        original_count = len(self.df)
        filtered_count = len(self.filtered_df)
        removed_count = original_count - filtered_count

        print(f"✓ Filtered data for year {year} onwards")
        print(f"  Original records: {original_count}")
        print(f"  Filtered records: {filtered_count}")

        return self.filtered_df

    def classify_comments(self, comment_column: str = COMMENT_COLUMN, client=None,
                          batch_size: int = 500, limit: int = None) -> pd.DataFrame:
        """
        Add category1 and category2 to the filtered data using an LLM (comments sent in batches).

        Args:
            comment_column: Name of the column containing the comments
            client: LLM client (default: created from LLM_PROVIDER / env settings)
            batch_size: Number of comments per LLM request
            limit: Only classify the first N rows (for testing)

        Returns:
            Filtered DataFrame with category1 and category2 columns
        """
        if self.filtered_df is None:
            raise ValueError("Must call filter_from_year() first")

        df = self.filtered_df.head(limit) if limit else self.filtered_df
        self.filtered_df = asyncio.run(
            add_categories(df, comment_column, client or create_client(), batch_size=batch_size)
        )
        return self.filtered_df

    def execute(self, year: int = 2025, **classify_options) -> pd.DataFrame:
        """
        Execute the full pipeline: read → extract year → filter → classify.

        Args:
            year: Starting year for filtering (default: 2025)
            **classify_options: Passed to classify_comments (client, batch_size, limit)

        Returns:
            Filtered and classified DataFrame
        """
        print(f"   Filter from: {year} onwards\n")

        try:
            self.read_data()
            self.add_year_extraction()
            self.filter_from_year(year)
            self.classify_comments(**classify_options)
            
            return self.filtered_df

        except Exception as e:
            print(f"\n❌ Pipeline failed: {str(e)}\n")
            raise

    def save_filtered_data(self, output_path: str) -> None:
        """
        Save the (classified) result to an Excel file.

        Args:
            output_path: Path to save the result
        """
        if self.filtered_df is None:
            raise ValueError("No filtered data available. Run execute() first.")

        self.filtered_df.drop(columns=["year"], errors="ignore").to_excel(
            output_path, index=False, sheet_name=INPUT_SHEET_NAME
        )
        print(f"✓ Saved result to {output_path}")



def main():
    """
    Read the input Excel file, filter, classify and save the result in the output folder.
    """
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025, help="keep rows from this year onwards")
    ap.add_argument("--limit", type=int, help="only classify the first N rows (for testing)")
    ap.add_argument("--batch-size", type=int, default=500, help="comments per LLM request")
    ap.add_argument("--provider", help="databricks or openai (default: LLM_PROVIDER env var)")
    args = ap.parse_args()

    project_root = Path(__file__).parent.parent
    excel_file = project_root / INPUT_DIR_NAME / INPUT_FILE_NAME

    # Check if file exists
    if not excel_file.exists():
        raise FileNotFoundError(f"Input Excel file not found: {excel_file}")

    # Initialize pipeline
    pipeline = DataPipeline(
        file_path=str(excel_file),
        date_column=DATE_COLUMN,
        sheet_name=INPUT_SHEET_NAME,
    )

    # Execute the pipeline (read, filter, classify)
    pipeline.execute(
        year=args.year,
        client=create_client(args.provider),
        batch_size=args.batch_size,
        limit=args.limit,
    )

    # Save the classified result
    output_dir = project_root / OUTPUT_DIR_NAME
    output_dir.mkdir(exist_ok=True)
    pipeline.save_filtered_data(str(output_dir / OUTPUT_FILE_NAME))


if __name__ == "__main__":
    main()
