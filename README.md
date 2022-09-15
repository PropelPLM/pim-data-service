# About

# Import

# Export

## Product List Page Export
### salesforce sends
- a list of product record ids
- a list of variant value record ids
- the category id
- category isPrimary boolean value
- is template export boolean value (if exporting from template, returns true)
- selected attribute label columns (if exporting only selected columns, contains user selected labels ids)
- selected attribute group columns (if exporting only selected columns, contains user selected groups ids)

### heroku
- queries for selected products
- queries for variant values
- queries for the selected records' attributes
- creates a list of objects with key value pairs of field name and value
- if exporting from template, obtain the columns and column headers from the template
- if exporting only selected columns, query the selected attribute labels and attribute labels of selected attribute groups
- if exporting all columns, query all attribute labels
- create list of column objects with key value pairs of fieldname, label, and type
- put in CSV and post to chatter

## Product Data Page Export
### salesforce sends
- the product record id
- exportType (current variant or all variants)
- variant value path (if exportType is current variant)
- isInherited boolean value (if fill in inherited data checkbox is selected)
- is template export boolean value (if is template export checkbox was checked)
- list of excluded attribute labels and linked attribute groups ids (excluded attribute labels are sent since we need attribute labels that are linked to the product and also those not linked to any product, so we derive those from attribute labels only linked to other products, aka excluded labels)

### heroku
- queries product and its variants
- queries child attribute labels of linked attribute groups
- query attribute labels that are linked to the product, or not linked to any product, or children of linked attribute groups
- query variants and values (depending on the exportType)
    - create a list of objects with key value pairs of field name and values
- if is inherited, iterate through the variants from top to bottom, and populate inherited values from parent to child
- if exportType is template export, obtain the columns and column headers from the template
- create list of column objects with key value pairs of fieldname, label, and type
- put in CSV and post to chatter
