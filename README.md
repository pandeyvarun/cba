# Data Pipeline - Commonwealth Bank User Comments

Reads an Excel file of customer comments, keeps the rows from a given year onwards, and uses an LLM to add two
columns to every row:

- `category1` - profile category (for example `business profile`, `personal profile`, `general profile`)
- `category2` - comment / issue reported (for example `transactions`, `security`, `customer support`)

The result is saved as a new Excel file. The category values and their definitions are set in a config file, so you
can change them without touching the code.

## Pipeline steps

1. **Read** the Excel file.
2. **Filter** rows whose `Date` year is the start year or later (default 2025).
3. **Classify** the `Comment` of each row with the LLM. Comments are sent in batches of 500, a few requests at a time.
   Rows that get no prediction are collected and sent again, up to 5 runs in total.
4. **Save** the result in the `output` folder.

## Setup

Requires Python 3.11. Use a virtual environment so the packages stay separate from your other projects.

**1. Create the virtual environment** (from the project root, once):

```powershell
python -m venv venv
```

**2. Activate it** (every time you open a new terminal):

```powershell
# Windows PowerShell
venv\Scripts\Activate.ps1
```

```bat
:: Windows Command Prompt
venv\Scripts\activate.bat
```

```bash
# macOS / Linux / Git Bash
source venv/bin/activate        # Git Bash on Windows: source venv/Scripts/activate
```

When it is active, the prompt starts with `(venv)`. If PowerShell blocks the script with an execution-policy error,
run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.

**3. Install the packages:**

```powershell
pip install -r requirements.txt
```

To leave the virtual environment, run `deactivate`. Do not commit the `venv` folder.

Create a `.env` file in the project root (copy `.env.example`) with your LLM settings:

| Variable | Needed for | Description |
|---|---|---|
| `LLM_PROVIDER` | optional | `databricks` (default) or `openai` |
| `DATABRICKS_TOKEN` | `databricks` | Access token for the Databricks model serving endpoint |
| `DATABRICKS_ENDPOINT_URL` | optional | Overrides the default endpoint URL in `tools/llm.py` |
| `OPENAI_API_KEY` | `openai` | OpenAI API key |
| `OPENAI_MODEL` | optional | OpenAI model, default `gpt-4.1` |

Never commit the `.env` file.

## Input and output files

Folders are relative to the project root (`D:\ailab\cba_data_pipeline`).

| | Location | Details |
|---|---|---|
| **Input** | `data\commbank_user_comment.xlsx` | Sheet `Comments`, with at least a `Date` column and a `Comment` column |
| **Output** | `output\commbank_user_comment_categorized.xlsx` | Sheet `Comments`; the input columns plus `category1` and `category2` |

- Put your input file in the `data` folder with that name, or change the names in `constants.py` (see below).
- The `output` folder is created if it does not exist.
- **To change the name of the output file** (or the output folder), update `OUTPUT_FILE_NAME` (and
  `OUTPUT_DIR_NAME`) in `data_pipeline/constants.py`, for example `OUTPUT_FILE_NAME = "my_result.xlsx"`. See
  [Constants](#constants-data_pipelineconstantspy) for details.
- The output contains only the rows from the start year onwards, in the original order. The pipeline does not save a
  separate "filtered only" file.
- **A new run overwrites the previous output file.** Rename or move it first if you want to keep it, and close it in
  Excel before running, otherwise saving fails.
- Rows whose `Date` cannot be read as a date are dropped by the year filter.

## Constants (`data_pipeline/constants.py`)

File names, folders, the sheet name and the column names are not hardcoded in the pipeline. They are defined in
`data_pipeline/constants.py`; edit that file to point the pipeline at your own files.

```python
# Input / output files (relative to the project root)
INPUT_DIR_NAME = "data"
INPUT_FILE_NAME = "commbank_user_comment.xlsx"
INPUT_SHEET_NAME = "Comments"
OUTPUT_DIR_NAME = "output"
OUTPUT_FILE_NAME = "commbank_user_comment_categorized.xlsx"

# Column names in the input file
DATE_COLUMN = "Date"
COMMENT_COLUMN = "Comment"
```

| Constant | Default | What it controls |
|---|---|---|
| `INPUT_DIR_NAME` | `"data"` | Folder that holds the input file. |
| `INPUT_FILE_NAME` | `"commbank_user_comment.xlsx"` | Name of the input Excel file inside that folder (must be `.xlsx` or `.xls`). |
| `INPUT_SHEET_NAME` | `"Comments"` | Sheet to read. The output file uses the same sheet name. |
| `OUTPUT_DIR_NAME` | `"output"` | Folder where the result is written. It is created if it does not exist. |
| `OUTPUT_FILE_NAME` | `"commbank_user_comment_categorized.xlsx"` | Name of the result file (use the `.xlsx` extension). |
| `DATE_COLUMN` | `"Date"` | Column used for the year filter. |
| `COMMENT_COLUMN` | `"Comment"` | Column whose text is sent to the LLM. |

### How to define the input and output location

The input path is built as `<project root> / INPUT_DIR_NAME / INPUT_FILE_NAME` and the output path as
`<project root> / OUTPUT_DIR_NAME / OUTPUT_FILE_NAME`. The project root is the folder that contains
`data_pipeline` (`D:\ailab\cba_data_pipeline`). A folder can be:

- a **folder name relative to the project root**, such as `"data"` or `"output"`;
- a **nested relative folder**, such as `"data/raw"` or `"output/2025"`;
- an **absolute path**, such as `"D:/shared/comments"`. An absolute folder replaces the project root, so the file
  is read from or written to exactly that folder.

Examples:

```python
# Read data\q4_comments.xlsx (sheet "Reviews") and write to output\q4\q4_result.xlsx
INPUT_DIR_NAME = "data"
INPUT_FILE_NAME = "q4_comments.xlsx"
INPUT_SHEET_NAME = "Reviews"
OUTPUT_DIR_NAME = "output/q4"
OUTPUT_FILE_NAME = "q4_result.xlsx"
```

```python
# Read and write on another drive
INPUT_DIR_NAME = "E:/exports"
OUTPUT_DIR_NAME = "E:/results"
```

Tips:

- Use forward slashes (`"E:/exports"`) in paths, or a raw string (`r"E:\exports"`), so Windows backslashes are not
  treated as escape characters.
- The sheet name and column names must match the Excel file exactly, including capital letters. A wrong name
  causes a `KeyError` or "sheet not found" error.
- To avoid overwriting an earlier result, give `OUTPUT_FILE_NAME` a new name before each run.
- `COMMONWEALTH_BANK_USER_COMMENT_TABLE` is also in `constants.py`. It is only the default sheet name for the
  `DataPipeline` class when you create it yourself without a `sheet_name`; the command-line pipeline uses
  `INPUT_SHEET_NAME`.

## Running the pipeline

From the project root:

```powershell
python data_pipeline\pipeline.py
```

`python classify_comments.py` does exactly the same (it just calls the pipeline's `main()`).

### Arguments

All arguments are optional.

| Argument | Default | What it does |
|---|---|---|
| `--year` | `2025` | Keep only rows whose `Date` year is this year or later. |
| `--limit` | none (all rows) | Classify only the first N rows after filtering. Use it for quick tests; the output then holds only those N rows. |
| `--batch-size` | `500` | Number of comments sent to the LLM in one request. Smaller batches make each request lighter, so a failed request loses fewer rows, but more requests are needed. |
| `--provider` | `LLM_PROVIDER` env var, otherwise `databricks` | LLM to use: `databricks` or `openai`. |

Examples:

```powershell
# Full run: all rows from 2025 onwards
python data_pipeline\pipeline.py

# Quick test on the first 500 rows
python data_pipeline\pipeline.py --limit 500

# Rows from 2024 onwards, smaller batches
python data_pipeline\pipeline.py --year 2024 --batch-size 200

# Use OpenAI instead of Databricks
python data_pipeline\pipeline.py --provider openai
```

While it runs, the console shows the filtering counts and, for each run, which batches have completed, for example
`Run 1 batch 3/21 completed (500/500 rows classified)`. A line such as `(0/500 rows classified)` means the whole
request failed; those rows are retried in the next run. The last line shows the total, for example
`Classified 10413/10413 rows`.

### Settings in the code

These are not command-line arguments. Change them in the code if needed.

| Setting | Value | Where |
|---|---|---|
| Input / output folder and file names, sheet name, `Date` and `Comment` column names | see `constants.py` | `constants.py` |
| Number of parallel LLM requests | `4` (`max_workers`) | `tools/classifier.py`, `add_categories()` |
| Maximum runs over rows without a prediction | `5` (`MAX_RUNS`) | `tools/classifier.py` |
| Maximum characters of a comment sent to the LLM | `1000` (`MAX_COMMENT_CHARS`) | `tools/classifier.py` |

## Changing the categories and the prompt

Everything the model is told lives in two YAML files in `config\`:

- **`categories.yaml`** - the role of the model, the allowed values of `category1` and `category2` with their
  definitions, and the rules. To add, edit or remove a value, change its entry under `values` and give it a clear
  description. The `default:` line for each category is not used at the moment.
- **`system_prompt.yaml`** - the wording of the prompt around those definitions, and the batch instructions. The
  placeholders in curly braces (for example `{role}`, `{category_definitions}`) are filled in from
  `categories.yaml`, so keep them; a literal curly brace in the text must be doubled (`{{ }}`).

Each allowed value is shown to the model with a number (its position in `categories.yaml`, starting at 1), and the
model answers with numbers, such as `12|2|5` (row id, `category1` number, `category2` number). This keeps replies
short and fast. The code maps the numbers back to the label names, so adding or reordering values needs no code change.

## Project layout

```
README.md
requirements.txt              # Python dependencies
classify_comments.py          # shortcut that runs the pipeline
data/                         # input file goes here
output/                       # result file is written here
data_pipeline/
├── pipeline.py               # DataPipeline class and main() with the command-line arguments
├── constants.py              # file names, sheet name, column names
├── config/
│   ├── categories.yaml       # category values, definitions, rules
│   └── system_prompt.yaml    # prompt template
└── tools/
    ├── excel.py              # read Excel, extract the year from dates
    ├── prompt.py             # builds the system prompt from the config files
    ├── llm.py                # async LLM client (Databricks or OpenAI)
    └── classifier.py         # sends batches to the LLM and collects the answers
```

## Using it from Python

```python
from data_pipeline.pipeline import DataPipeline

pipeline = DataPipeline("data/commbank_user_comment.xlsx", date_column="Date", sheet_name="Comments")
result = pipeline.execute(year=2025, batch_size=500, limit=None)   # read -> filter -> classify
pipeline.save_filtered_data("output/result.xlsx")                  # saves the classified result
```

The steps can also be called one by one: `read_data()`, `add_year_extraction()`, `filter_from_year(year)`,
`classify_comments(batch_size=..., limit=...)`.

## Troubleshooting

| Problem | What to check |
|---|---|
| `Input Excel file not found` | The file must be at `data\commbank_user_comment.xlsx` (or the name set in `constants.py`). |
| `DATABRICKS_TOKEN is not set` | Add it to `.env` or set it in the terminal for the session. |
| Some rows have empty `category1` / `category2` | The model did not answer for them in any of the 5 runs. Check the `batch ... completed` lines for batches with `0/...`, then try a smaller `--batch-size`, or run again. |
| Saving fails with a permission error | The output file is open in Excel. Close it and run again. |
