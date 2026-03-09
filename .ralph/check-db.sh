#!/bin/bash
PGPASSWORD=postgres psql -U postgres -h db -d tripful -c "SELECT id, name, destination, destination_lat, destination_lon FROM trips ORDER BY created_at DESC LIMIT 5;"
