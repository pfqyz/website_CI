import csv
import json

# Открываем CSV-файл
with open('data.csv', encoding='utf-8') as csv_file:

    csv_reader = csv.DictReader(csv_file)

    data = list(csv_reader)

# Записываем результат в JSON-файл
with open('data.json', 'w', encoding='utf-8') as json_file:
    json.dump(data, json_file, ensure_ascii=False, indent=4)