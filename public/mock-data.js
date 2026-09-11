// Mock flight dataset for Cochin International Airport (COK)
// Allows testing & verification even when offline, rate-limited, or proxies are down.

(function(global) {
  function getMockSchedule(baseTs) {
    const now = baseTs || Math.floor(Date.now() / 1000);
    const m = 60; // 1 minute in seconds
    const h = 3600; // 1 hour in seconds

    // Realistic allow-listed flights for COK (Air India Express, AirAsia, SriLankan, Jazeera, flydubai, Oman Air, Air Arabia, Etihad)
    const arrivals = [
      {
        flight: {
          identification: { id: 'arr_ix_474', number: { default: 'IX 474' }, callsign: 'AXB474' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-AXP' },
          airport: { origin: { code: { iata: 'DXB' }, position: { region: { city: 'Dubai' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now - 35 * m },
            estimated: { arrival: now - 30 * m },
            real: { arrival: now - 32 * m }
          },
          status: { text: 'Landed', generic: { status: { text: 'landed', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_fz_441', number: { default: 'FZ 441' }, callsign: 'FDB441' },
          airline: { name: 'flydubai', code: { iata: 'FZ', icao: 'FDB' } },
          aircraft: { model: { code: 'B38M', text: 'Boeing 737 MAX 8' }, registration: 'A6-FNA' },
          airport: { origin: { code: { iata: 'DXB' }, position: { region: { city: 'Dubai' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 25 * m },
            estimated: { arrival: now + 42 * m },
            real: { arrival: null }
          },
          status: { text: 'Estimated', generic: { status: { text: 'delayed', color: 'yellow' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_ey_280', number: { default: 'EY 280' }, callsign: 'ETD280' },
          airline: { name: 'Etihad Airways', code: { iata: 'EY', icao: 'ETD' } },
          aircraft: { model: { code: 'A321', text: 'Airbus A321' }, registration: 'A6-AEC' },
          airport: { origin: { code: { iata: 'AUH' }, position: { region: { city: 'Abu Dhabi' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 1 * h + 15 * m },
            estimated: { arrival: now + 1 * h + 12 * m },
            real: { arrival: null }
          },
          status: { text: 'On Time', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_g9_426', number: { default: 'G9 426' }, callsign: 'ABY426' },
          airline: { name: 'Air Arabia', code: { iata: 'G9', icao: 'ABY' } },
          aircraft: { model: { code: 'A320', text: 'Airbus A320' }, registration: 'A6-AOB' },
          airport: { origin: { code: { iata: 'SHJ' }, position: { region: { city: 'Sharjah' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 2 * h },
            estimated: { arrival: now + 2 * h + 50 * m },
            real: { arrival: null }
          },
          status: { text: 'Delayed', generic: { status: { text: 'delayed', color: 'red' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_ul_165', number: { default: 'UL 165' }, callsign: 'ALK165' },
          airline: { name: 'SriLankan Airlines', code: { iata: 'UL', icao: 'ALK' } },
          aircraft: { model: { code: 'A320', text: 'Airbus A320' }, registration: '4R-ABN' },
          airport: { origin: { code: { iata: 'CMB' }, position: { region: { city: 'Colombo' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 3 * h + 10 * m },
            estimated: { arrival: now + 3 * h + 10 * m },
            real: { arrival: null }
          },
          status: { text: 'On Time', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_ak_38', number: { default: 'AK 38' }, callsign: 'AXM38' },
          airline: { name: 'AirAsia', code: { iata: 'AK', icao: 'AXM' } },
          aircraft: { model: { code: 'A20N', text: 'Airbus A320neo' }, registration: '9M-AGF' },
          airport: { origin: { code: { iata: 'KUL' }, position: { region: { city: 'Kuala Lumpur' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 4 * h },
            estimated: { arrival: now + 4 * h },
            real: { arrival: null }
          },
          status: { text: 'On Time', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_j9_407', number: { default: 'J9 407' }, callsign: 'JZR407' },
          airline: { name: 'Jazeera Airways', code: { iata: 'J9', icao: 'JZR' } },
          aircraft: { model: { code: 'A20N', text: 'Airbus A320neo' }, registration: '9K-CBM' },
          airport: { origin: { code: { iata: 'KWI' }, position: { region: { city: 'Kuwait' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 5 * h + 20 * m },
            estimated: { arrival: null },
            real: { arrival: null }
          },
          status: { text: 'Cancelled', generic: { status: { text: 'cancelled', color: 'red' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_wy_297', number: { default: 'WY 297' }, callsign: 'OMA297' },
          airline: { name: 'Oman Air', code: { iata: 'WY', icao: 'OMA' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'A4O-BA' },
          airport: { origin: { code: { iata: 'MCT' }, position: { region: { city: 'Muscat' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 6 * h + 45 * m },
            estimated: { arrival: now + 6 * h + 45 * m },
            real: { arrival: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_ix_412', number: { default: 'IX 412' }, callsign: 'AXB412' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-AYC' },
          airport: { origin: { code: { iata: 'SHJ' }, position: { region: { city: 'Sharjah' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 5 * h + 30 * m },
            estimated: { arrival: now + 5 * h + 40 * m },
            real: { arrival: null }
          },
          status: { text: 'Estimated', generic: { status: { text: 'delayed', color: 'yellow' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_fd_170', number: { default: 'FD 170' }, callsign: 'AIQ170' },
          airline: { name: 'AirAsia (Thai)', code: { iata: 'FD', icao: 'AIQ' } },
          aircraft: { model: { code: 'A20N', text: 'Airbus A320neo' }, registration: 'HS-BBX' },
          airport: { origin: { code: { iata: 'DMK' }, position: { region: { city: 'Bangkok' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 7 * h },
            estimated: { arrival: now + 7 * h },
            real: { arrival: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'arr_ix_538', number: { default: 'IX 538' }, callsign: 'AXB538' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-GHF' },
          airport: { origin: { code: { iata: 'DXB' }, position: { region: { city: 'Dubai' } } }, destination: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } } },
          time: {
            scheduled: { arrival: now + 8 * h + 20 * m },
            estimated: { arrival: now + 8 * h + 20 * m },
            real: { arrival: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      }
    ];

    const departures = [
      {
        flight: {
          // Turnaround pair with arr_ix_474 (VT-AXP): arrival landed at now-35m, departure at now+40m (75 min ground turnaround)
          identification: { id: 'dep_ix_475', number: { default: 'IX 475' }, callsign: 'AXB475' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-AXP' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'DOH' }, position: { region: { city: 'Doha' } } } },
          time: {
            scheduled: { departure: now + 40 * m },
            estimated: { departure: now + 40 * m },
            real: { departure: null }
          },
          status: { text: 'Boarding', generic: { status: { text: 'active', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_ix_412 (VT-AYC): arrival at now+5h30m, departure at now+6h45m (75 min turnaround)
          identification: { id: 'dep_ix_413', number: { default: 'IX 413' }, callsign: 'AXB413' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-AYC' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'AUH' }, position: { region: { city: 'Abu Dhabi' } } } },
          time: {
            scheduled: { departure: now + 6 * h + 45 * m },
            estimated: { departure: now + 6 * h + 45 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_fd_170 (HS-BBX): arrival at now+7h, departure at now+8h (60 min turnaround)
          identification: { id: 'dep_fd_171', number: { default: 'FD 171' }, callsign: 'AIQ171' },
          airline: { name: 'AirAsia (Thai)', code: { iata: 'FD', icao: 'AIQ' } },
          aircraft: { model: { code: 'A20N', text: 'Airbus A320neo' }, registration: 'HS-BBX' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'DMK' }, position: { region: { city: 'Bangkok' } } } },
          time: {
            scheduled: { departure: now + 8 * h },
            estimated: { departure: now + 8 * h },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_ix_538 (VT-GHF): arrival at now+8h20m, departure at now+9h30m (70 min turnaround)
          identification: { id: 'dep_ix_539', number: { default: 'IX 539' }, callsign: 'AXB539' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-GHF' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'RUH' }, position: { region: { city: 'Riyadh' } } } },
          time: {
            scheduled: { departure: now + 9 * h + 30 * m },
            estimated: { departure: now + 9 * h + 30 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_fz_441 (A6-FNA): arrival at now+25m, departure at now+1h30m (65 min turnaround)
          identification: { id: 'dep_fz_442', number: { default: 'FZ 442' }, callsign: 'FDB442' },
          airline: { name: 'flydubai', code: { iata: 'FZ', icao: 'FDB' } },
          aircraft: { model: { code: 'B38M', text: 'Boeing 737 MAX 8' }, registration: 'A6-FNA' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'DXB' }, position: { region: { city: 'Dubai' } } } },
          time: {
            scheduled: { departure: now + 1 * h + 30 * m },
            estimated: { departure: now + 1 * h + 45 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'delayed', color: 'yellow' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_ey_280 (A6-AEC): arrival at now+1h15m, departure at now+2h25m (70 min turnaround)
          identification: { id: 'dep_ey_281', number: { default: 'EY 281' }, callsign: 'ETD281' },
          airline: { name: 'Etihad Airways', code: { iata: 'EY', icao: 'ETD' } },
          aircraft: { model: { code: 'A321', text: 'Airbus A321' }, registration: 'A6-AEC' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'AUH' }, position: { region: { city: 'Abu Dhabi' } } } },
          time: {
            scheduled: { departure: now + 2 * h + 25 * m },
            estimated: { departure: now + 2 * h + 25 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_ul_165 (4R-ABN): arrival at now+3h10m, departure at now+4h15m (65 min turnaround)
          identification: { id: 'dep_ul_166', number: { default: 'UL 166' }, callsign: 'ALK166' },
          airline: { name: 'SriLankan Airlines', code: { iata: 'UL', icao: 'ALK' } },
          aircraft: { model: { code: 'A320', text: 'Airbus A320' }, registration: '4R-ABN' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'CMB' }, position: { region: { city: 'Colombo' } } } },
          time: {
            scheduled: { departure: now + 4 * h + 15 * m },
            estimated: { departure: now + 4 * h + 15 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_g9_426 (A6-AOB): arrival at now+2h, departure at now+3h30m (90 min turnaround, heavy delay >30m)
          identification: { id: 'dep_g9_427', number: { default: 'G9 427' }, callsign: 'ABY427' },
          airline: { name: 'Air Arabia', code: { iata: 'G9', icao: 'ABY' } },
          aircraft: { model: { code: 'A320', text: 'Airbus A320' }, registration: 'A6-AOB' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'SHJ' }, position: { region: { city: 'Sharjah' } } } },
          time: {
            scheduled: { departure: now + 3 * h + 30 * m },
            estimated: { departure: now + 4 * h + 18 * m },
            real: { departure: null }
          },
          status: { text: 'Delayed', generic: { status: { text: 'delayed', color: 'red' } } }
        }
      },
      {
        flight: {
          // Turnaround pair with arr_ak_38 (9M-AGF): arrival at now+4h, departure at now+5h05m (65 min turnaround)
          identification: { id: 'dep_ak_39', number: { default: 'AK 39' }, callsign: 'AXM39' },
          airline: { name: 'AirAsia', code: { iata: 'AK', icao: 'AXM' } },
          aircraft: { model: { code: 'A20N', text: 'Airbus A320neo' }, registration: '9M-AGF' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'KUL' }, position: { region: { city: 'Kuala Lumpur' } } } },
          time: {
            scheduled: { departure: now + 5 * h + 5 * m },
            estimated: { departure: now + 5 * h + 5 * m },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      },
      {
        flight: {
          identification: { id: 'dep_ix_492', number: { default: 'IX 492' }, callsign: 'AXB492' },
          airline: { name: 'Air India Express', code: { iata: 'IX', icao: 'AXB' } },
          aircraft: { model: { code: 'B738', text: 'Boeing 737-800' }, registration: 'VT-AYD' },
          airport: { origin: { code: { iata: 'COK' }, position: { region: { city: 'Kochi' } } }, destination: { code: { iata: 'MCT' }, position: { region: { city: 'Muscat' } } } },
          time: {
            scheduled: { departure: now + 7 * h },
            estimated: { departure: now + 7 * h },
            real: { departure: null }
          },
          status: { text: 'Scheduled', generic: { status: { text: 'scheduled', color: 'green' } } }
        }
      }
    ];

    return {
      result: {
        response: {
          airport: {
            pluginData: {
              schedule: {
                arrivals: { data: arrivals },
                departures: { data: departures }
              }
            }
          }
        }
      }
    };
  }

  const MockFlightData = {
    getMockSchedule: getMockSchedule
  };

  if (typeof window !== 'undefined') {
    window.MockFlightData = MockFlightData;
  }
  if (typeof global !== 'undefined') {
    global.MockFlightData = MockFlightData;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MockFlightData;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
