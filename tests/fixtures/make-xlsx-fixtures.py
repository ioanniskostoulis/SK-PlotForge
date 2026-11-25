# Licensed under the GNU General Public License v2 or later. See LICENSE.
# Writes the Excel fixtures of tests/engine/data.test.ts with openpyxl, as Excel would store them: shared strings,
# number formats that make dates, a formula (openpyxl stores no cached result, so it reads as empty), truth values, a
# gap row, a second sheet, and a workbook on the 1904 date system.
#
#   python3 -I tests/fixtures/make-xlsx-fixtures.py
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.utils.datetime import CALENDAR_MAC_1904

HERE = Path(__file__).parent

book = Workbook()
sheet = book.active
sheet.title = "IV curve"
sheet.append(["Time (s)", "Current (mA)", "Current err", "Note", "Taken"])
sheet.append([0, 0.5, 0.05, "start", datetime(2026, 11, 15, 9, 30)])
sheet.append([1, 1.5, 0.07, None, datetime(2026, 11, 15, 9, 31)])
sheet.append([])
sheet.append([2, 2.25, 0.06, "end & stop", datetime(2026, 11, 15, 9, 32)])
for row in sheet.iter_rows(min_row=2, min_col=5, max_col=5):
    for cell in row:
        cell.number_format = "yyyy-mm-dd hh:mm"
sheet["G1"] = "Sum"
sheet["G2"] = "=A2+B2"
sheet["H1"] = "Ok"
sheet["H2"] = True
sheet["H3"] = False

other = book.create_sheet("Calibration")
other["B3"] = "Standard"
other["C3"] = "Value [nm]"
other["B4"] = "A"
other["C4"] = 10.5
other["B5"] = "B"
other["C5"] = 20
book.save(HERE / "data-iv.xlsx")

mac = Workbook()
mac.epoch = CALENDAR_MAC_1904
mac.active.title = "Days"
mac.active.append(["Day"])
mac.active.append([datetime(2026, 1, 2)])
mac.active["A2"].number_format = "yyyy-mm-dd"
mac.save(HERE / "data-1904.xlsx")
