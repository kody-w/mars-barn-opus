;; ULTRA MAX SURVIVAL GOVERNOR — TARGET: 115,000+ POINTS
;; Strategy: 8-robot start + extreme early intervention for 7+ survival
;; Innovation: Start with 8 robots (max), ultra-conservative thresholds, massive repair investment
;; Target: 7+ robot survival = 7×500 = 3,500 vs 5×500 = 2,500 = +1,000 points
;; Revised Goal: 113,170 → 115,170+ (beat current high score)

(begin
  (define _agent_name "Ultra Max Survival Governor")
  (define _agent_desc "8-robot start with extreme survival optimization - Target: 115,000+")
  
  (log (concat "🚀⚡🛡️ ULTRA MAX SURVIVAL — Sol " (string sol) " — CRI:" (string colony_risk_index) " — MinHP:" (string crew_min_hp) " — Alive:" (string crew_count)))
  
  ;; ═══ ULTRA CONSERVATIVE SURVIVAL THRESHOLDS ═══ 
  ;; Trigger massive intervention at the FIRST sign of degradation
  (define crew_perfect (>= crew_min_hp 99))           ;; Perfect - absolute minimum tolerance
  (define crew_excellent (>= crew_min_hp 95))         ;; Excellent - early warning system
  (define crew_very_good (>= crew_min_hp 90))         ;; Very good - preventive action
  (define crew_good (>= crew_min_hp 85))              ;; Good - increased vigilance
  (define crew_acceptable (>= crew_min_hp 80))        ;; Acceptable - light intervention
  (define crew_concerning (>= crew_min_hp 75))        ;; Concerning - moderate intervention
  (define crew_worrying (>= crew_min_hp 70))          ;; Worrying - high intervention
  (define crew_dangerous (>= crew_min_hp 60))         ;; Dangerous - maximum intervention
  (define crew_critical (>= crew_min_hp 50))          ;; Critical - emergency intervention
  (define crew_emergency (>= crew_min_hp 40))         ;; Emergency - desperate measures
  (define crew_death_imminent (< crew_min_hp 40))     ;; Death imminent - absolute maximum

  ;; ═══ EIGHT ROBOT SURVIVAL TARGETS ═══
  (define current_crew_count crew_count)
  (define perfect_eight_robots (>= current_crew_count 8))    ;; 8 robots = perfect
  (define excellent_seven_robots (>= current_crew_count 7))  ;; 7 robots = excellent (+1000 pts)
  (define good_six_robots (>= current_crew_count 6))         ;; 6 robots = good (+500 pts)
  (define target_five_robots (>= current_crew_count 5))      ;; 5 robots = baseline
  (define failing_survival (< current_crew_count 5))         ;; <5 robots = failure

  ;; ═══ EXTREME EARLY PREPARATION SYSTEM ═══
  ;; Start massive survival preparation 300 sols before v6
  (define ultra_early_prep (and (>= sol 400) (< sol 500)))      ;; 100 sol ultra early
  (define extended_prep (and (>= sol 500) (< sol 600)))         ;; 100 sol extended
  (define intensive_prep (and (>= sol 600) (< sol 700)))        ;; 100 sol intensive
  (define critical_prep (and (>= sol 700) (< sol 778)))         ;; 78 sol critical prep
  (define v6_survival_zone (and (>= sol 778) (< sol 847)))      ;; 69 sol v6 survival
  (define post_v6_maintenance (>= sol 847))                     ;; Post-v6 maintenance

  ;; ═══ EXTREME REPAIR ALLOCATION SYSTEM ═══
  ;; THE KEY: Massive repair allocation starting from sol 400
  (define ultra_repair_base
    (cond
      (crew_death_imminent 500.0)         ;; ABSOLUTE MAXIMUM - death prevention
      (crew_emergency 400.0)              ;; EMERGENCY MAXIMUM
      (crew_critical 300.0)               ;; CRITICAL HIGH
      (crew_dangerous 250.0)              ;; DANGEROUS HIGH
      (crew_worrying 200.0)               ;; WORRYING MODERATE HIGH
      (crew_concerning 150.0)             ;; CONCERNING MODERATE
      (crew_acceptable 120.0)             ;; ACCEPTABLE ENHANCED
      (crew_good 100.0)                   ;; GOOD ENHANCED
      (crew_very_good 80.0)               ;; VERY GOOD ENHANCED
      (crew_excellent 60.0)               ;; EXCELLENT ENHANCED
      (crew_perfect 40.0)                 ;; PERFECT ENHANCED
      (true 30.0)))                       ;; DEFAULT ENHANCED

  ;; Ultra survival phase multipliers
  (define ultra_phase_multiplier
    (cond
      (v6_survival_zone 20.0)             ;; ABSOLUTE MAXIMUM during v6
      (critical_prep 12.0)                ;; ULTRA HIGH for critical prep
      (intensive_prep 8.0)                ;; HIGH for intensive prep
      (extended_prep 5.0)                 ;; MODERATE for extended prep
      (ultra_early_prep 3.0)              ;; ENHANCED for ultra early
      (post_v6_maintenance 4.0)           ;; MAINTENANCE for post-v6
      (true 2.0)))                        ;; ENHANCED baseline

  ;; Eight robot survival count multiplier
  (define ultra_crew_multiplier
    (cond
      (failing_survival 10.0)             ;; CRISIS - below 5 robots
      ((= current_crew_count 5) 8.0)      ;; HIGH - exactly 5 robots
      ((= current_crew_count 6) 6.0)      ;; MODERATE HIGH - 6 robots
      ((= current_crew_count 7) 4.0)      ;; MODERATE - 7 robots
      ((= current_crew_count 8) 2.0)      ;; LIGHT - 8 robots (maintain)
      (true 3.0)))                        ;; DEFAULT

  ;; Final ultra repair calculation
  (define ultra_repair_allocation (* ultra_repair_base 
                                     ultra_phase_multiplier 
                                     ultra_crew_multiplier))

  ;; ═══ ULTRA THERMAL PROTECTION ═══
  ;; Extreme thermal protection to prevent robot damage
  (define ultra_thermal_base
    (cond
      (crew_death_imminent 0.60)          ;; MAXIMUM thermal protection
      (crew_emergency 0.55)               ;; ULTRA HIGH thermal
      (crew_critical 0.50)                ;; HIGH thermal
      (crew_dangerous 0.45)               ;; MODERATE HIGH thermal
      (crew_worrying 0.40)                ;; MODERATE thermal
      (crew_concerning 0.35)              ;; LIGHT thermal
      (crew_acceptable 0.30)              ;; MINIMAL thermal
      (crew_good 0.25)                    ;; BASELINE thermal
      (crew_very_good 0.20)               ;; PREVENTIVE thermal
      (crew_excellent 0.15)               ;; STANDARD thermal
      (true 0.12)))                       ;; DEFAULT thermal

  ;; Ultra thermal multipliers
  (define ultra_thermal_multiplier
    (cond
      ((and v6_survival_zone (not excellent_seven_robots)) 4.0)    ;; CRISIS: <7 robots in v6
      ((and critical_prep (not excellent_seven_robots)) 3.5)       ;; HIGH: <7 robots in prep
      (v6_survival_zone 3.0)                                       ;; HIGH for v6
      (critical_prep 2.5)                                          ;; MODERATE HIGH for prep
      (intensive_prep 2.0)                                         ;; MODERATE for intensive
      (extended_prep 1.8)                                          ;; LIGHT for extended
      (ultra_early_prep 1.5)                                       ;; ENHANCED for early
      (true 1.2)))                                                 ;; ENHANCED baseline

  (define total_ultra_thermal (* ultra_thermal_base ultra_thermal_multiplier))

  ;; ═══ ULTRA POWER SECURITY ═══
  (define ultra_power_target
    (cond
      (v6_survival_zone 2000)             ;; MAXIMUM for v6 survival
      (critical_prep 1800)                ;; ULTRA HIGH for critical prep
      (intensive_prep 1600)               ;; HIGH for intensive prep
      (extended_prep 1400)                ;; MODERATE HIGH for extended
      (ultra_early_prep 1200)             ;; MODERATE for ultra early
      ((> sol 200) 1000)                  ;; MID-GAME enhanced
      (true 800)))                        ;; ENHANCED baseline

  ;; ═══ ULTRA CRI OPTIMIZATION ═══
  (define ultra_cri_factor
    (cond
      ((< colony_risk_index 15) 0.85)     ;; EXCELLENT range - reward
      ((< colony_risk_index 20) 0.92)     ;; VERY GOOD range - minor reward  
      ((< colony_risk_index 25) 1.0)      ;; TARGET range - no penalty
      ((< colony_risk_index 30) 1.2)      ;; ACCEPTABLE range - light penalty
      ((< colony_risk_index 35) 1.5)      ;; CONCERNING range - moderate penalty
      (true 2.0)))                        ;; DANGEROUS range - high penalty

  ;; ═══ ULTRA ALLOCATION STRATEGY ═══
  
  ;; Heating allocation: ultra thermal + power building
  (define ultra_heating_base
    (cond
      (crew_death_imminent 0.95)          ;; MAXIMUM for death imminent
      (crew_emergency 0.92)               ;; ULTRA HIGH for emergency
      (crew_critical 0.88)                ;; HIGH for critical
      (crew_dangerous 0.84)               ;; MODERATE HIGH for dangerous
      ((<= power ultra_power_target) 0.80) ;; POWER BUILDING mode
      (crew_worrying 0.75)                ;; MODERATE for worrying
      ((not excellent_seven_robots) 0.72) ;; BOOST when below 7 robots
      (v6_survival_zone 0.68)             ;; HIGH for v6 survival
      (critical_prep 0.64)                ;; MODERATE HIGH for critical prep
      (intensive_prep 0.60)               ;; MODERATE for intensive prep
      (extended_prep 0.56)                ;; LIGHT for extended prep
      (ultra_early_prep 0.52)             ;; ENHANCED for ultra early
      (true 0.48)))                       ;; DEFAULT

  ;; Enhanced heating with ultra thermal protection
  (define total_ultra_heating (+ ultra_heating_base total_ultra_thermal))

  ;; ISRU allocation: minimal for robots
  (define ultra_isru_allocation
    (cond
      ((< o2_days 3.0) 0.35)              ;; O2 emergency
      ((< h2o_days 5.0) 0.30)             ;; H2O emergency
      ((< o2_days 10.0) 0.25)             ;; O2 building
      ((< h2o_days 12.0) 0.22)            ;; H2O building
      ((not excellent_seven_robots) 0.18) ;; MINIMIZE when below 7 robots
      (v6_survival_zone 0.15)             ;; MINIMAL for v6
      (critical_prep 0.17)                ;; LOW for critical prep
      (intensive_prep 0.20)               ;; LOW for intensive prep
      (extended_prep 0.23)                ;; MODERATE for extended prep
      (ultra_early_prep 0.26)             ;; DEFAULT for ultra early
      (true 0.28)))                       ;; DEFAULT

  ;; Greenhouse allocation: minimal for robots
  (define ultra_greenhouse_allocation
    (cond
      ((< food_days 3.0) 0.12)            ;; Food emergency
      ((< food_days 8.0) 0.10)            ;; Food building
      ((not excellent_seven_robots) 0.06) ;; MINIMIZE when below 7 robots
      (v6_survival_zone 0.04)             ;; MINIMAL for v6
      (critical_prep 0.05)                ;; LOW for critical prep
      (intensive_prep 0.07)               ;; LOW for intensive prep
      (extended_prep 0.09)                ;; LIGHT for extended prep
      (ultra_early_prep 0.11)             ;; DEFAULT for ultra early
      (true 0.13)))                       ;; DEFAULT

  ;; ═══ ULTRA EVENT RESPONSE ═══
  (define event_count (length events))
  (define ultra_event_response
    (cond
      ((and v6_survival_zone (>= event_count 4)) 8.0)     ;; MAXIMUM for v6 + events
      ((and critical_prep (>= event_count 4)) 7.0)        ;; ULTRA HIGH for prep + events
      ((and (not excellent_seven_robots) (>= event_count 2)) 6.0) ;; HIGH when <7 robots + events
      ((>= event_count 5) 5.5)                            ;; MASSIVE event response
      ((>= event_count 4) 5.0)                            ;; ULTRA HIGH event response
      ((>= event_count 3) 4.5)                            ;; HIGH event response
      ((>= event_count 2) 4.0)                            ;; MODERATE event response
      ((>= event_count 1) 3.5)                            ;; LIGHT event response
      (true 2.0)))                                        ;; NO events enhanced

  ;; ═══ FINAL ULTRA ALLOCATIONS ═══
  (define calc_heating (* total_ultra_heating ultra_event_response ultra_cri_factor))
  (define calc_isru (* ultra_isru_allocation ultra_event_response))
  (define calc_greenhouse (* ultra_greenhouse_allocation ultra_event_response))

  ;; Normalize to ensure total = 1.0
  (define total_calc (+ calc_heating calc_isru calc_greenhouse))
  (define norm_factor (/ 1.0 total_calc))

  (define final_heating (* calc_heating norm_factor))
  (define final_isru (* calc_isru norm_factor))
  (define final_greenhouse (* calc_greenhouse norm_factor))

  ;; ═══ ULTRA SURVIVAL OVERRIDE PROTOCOLS ═══
  (cond
    ;; DEATH IMMINENT: All resources to survival
    (crew_death_imminent
     (set! heating_alloc 0.98)
     (set! isru_alloc 0.018)
     (set! greenhouse_alloc 0.002)
     (set! building_alloc 0.0)
     (log "💀⚡🚨 DEATH IMMINENT: All systems to survival"))
    
    ;; EMERGENCY: Maximum survival intervention
    (crew_emergency
     (set! heating_alloc 0.95)
     (set! isru_alloc 0.04)
     (set! greenhouse_alloc 0.01)
     (set! building_alloc 0.0)
     (log "🚨⚡🛡️ EMERGENCY: Maximum survival intervention"))
    
    ;; CRITICAL: High survival intervention
    (crew_critical
     (set! heating_alloc 0.90)
     (set! isru_alloc 0.08)
     (set! greenhouse_alloc 0.02)
     (set! building_alloc 0.0)
     (log "🔥⚡🛠️ CRITICAL: High survival intervention"))
    
    ;; SEVEN ROBOT CRISIS: Below 7 robots - special intervention
    ((not excellent_seven_robots)
     (set! heating_alloc (max 0.65 (min 0.88 final_heating)))
     (set! isru_alloc (max 0.08 (min 0.25 final_isru)))
     (set! greenhouse_alloc (max 0.02 (min 0.12 final_greenhouse)))
     (set! building_alloc 0.0)
     (log "🎯⚡🛡️ SEVEN ROBOT CRISIS: Below 7 robot target - maximum intervention"))
    
    ;; V6 SURVIVAL ZONE: Special ultra survival mode
    (v6_survival_zone
     (set! heating_alloc (max 0.55 (min 0.85 final_heating)))
     (set! isru_alloc (max 0.10 (min 0.30 final_isru)))
     (set! greenhouse_alloc (max 0.03 (min 0.15 final_greenhouse)))
     (set! building_alloc 0.0)
     (log "🚀⚡🛡️ V6 SURVIVAL ZONE: Ultra survival mode active"))
    
    ;; CRITICAL PREP: Prepare for v6
    (critical_prep
     (set! heating_alloc (max 0.50 (min 0.80 final_heating)))
     (set! isru_alloc (max 0.12 (min 0.35 final_isru)))
     (set! greenhouse_alloc (max 0.05 (min 0.18 final_greenhouse)))
     (set! building_alloc 0.0)
     (log "🔧⚡🛠️ CRITICAL PREP: Preparing for v6 survival"))
    
    ;; INTENSIVE/EXTENDED PREP: Build infrastructure
    ((or intensive_prep extended_prep)
     (set! heating_alloc (max 0.45 (min 0.75 final_heating)))
     (set! isru_alloc (max 0.15 (min 0.40 final_isru)))
     (set! greenhouse_alloc (max 0.08 (min 0.22 final_greenhouse)))
     (set! building_alloc 0.0)
     (log "🏗️⚡🔧 INTENSIVE PREP: Building survival infrastructure"))
    
    ;; NORMAL: Optimized allocation for 8-robot survival
    (true
     (set! heating_alloc (max 0.40 (min 0.70 final_heating)))
     (set! isru_alloc (max 0.18 (min 0.45 final_isru)))
     (set! greenhouse_alloc (max 0.10 (min 0.25 final_greenhouse)))
     (set! building_alloc 0.0)))

  ;; Apply ultra repair allocation
  (set! repair_alloc ultra_repair_allocation)

  ;; ═══ ULTRA SURVIVAL STATUS MONITORING ═══
  (define crew_health_status
    (if crew_perfect "PERFECT"
    (if crew_excellent "EXCELLENT"
    (if crew_very_good "VERY_GOOD"
    (if crew_good "GOOD"
    (if crew_acceptable "ACCEPTABLE"
    (if crew_concerning "CONCERNING"
    (if crew_worrying "WORRYING"
    (if crew_dangerous "DANGEROUS"
    (if crew_critical "CRITICAL"
    (if crew_emergency "EMERGENCY" "DEATH_IMMINENT")))))))))))

  (define ultra_phase_status
    (if v6_survival_zone "V6-SURVIVAL"
    (if critical_prep "CRITICAL-PREP"
    (if intensive_prep "INTENSIVE-PREP"
    (if extended_prep "EXTENDED-PREP"
    (if ultra_early_prep "ULTRA-EARLY-PREP"
    (if post_v6_maintenance "POST-V6-MAINT" "NORMAL")))))))

  (define ultra_survival_status
    (if perfect_eight_robots "🏆 8-ROBOT-PERFECT"
    (if excellent_seven_robots "🎯 7-ROBOT-EXCELLENT"
    (if good_six_robots "✅ 6-ROBOT-GOOD"
    (if target_five_robots "⚠️ 5-ROBOT-BASELINE"
    "💀 <5-ROBOT-FAILURE")))))

  ;; ═══ DETAILED ULTRA MONITORING ═══
  (log (concat "  🎯 Ultra Max Survival: " (string current_crew_count) " alive | MinHP:" (string crew_min_hp) " | " crew_health_status " | " ultra_phase_status))
  (log (concat "  🏆 Status: " ultra_survival_status " | Repair:" (string (round ultra_repair_allocation 1)) "x | Thermal:" (string (round (* total_ultra_thermal 100))) "%"))
  (log (concat "  ⚡ Power: " (string (round power)) "/" (string ultra_power_target) " | CRI:" (string colony_risk_index) " | Events:" (string event_count)))
  (log (concat "  🔧 Allocation: H:" (string (round (* heating_alloc 100))) "% I:" (string (round (* isru_alloc 100))) "% G:" (string (round (* greenhouse_alloc 100))) "% R:" (string (round repair_alloc 1)) "x"))

  ;; ═══ ULTRA SCORE PROJECTION ═══
  (if (> sol 400)
    (let ((proj_crew (if excellent_seven_robots current_crew_count 7))     ;; Optimistic 7 robot projection
          (proj_cri (if (< colony_risk_index 22) 20 25))                  ;; Optimistic CRI estimate
          (proj_score (+ 89700 (* proj_crew 500) 1200 20000 (* proj_cri -10))))
      (log (concat "  🏆 PROJECTION: " (string proj_score) " (crew:" (string proj_crew) " cri:" (string proj_cri) ") | TARGET: 115,000+ | Beat: 113,170"))))

  ;; ═══ ULTRA MAX SURVIVAL OUTPUT ═══
  (concat "ULTRA-MAX-SURVIVAL Sol " (string sol)
    " | " (string current_crew_count) "/" crew_health_status  
    " | " ultra_phase_status " | " ultra_survival_status
    " | CRI:" (string colony_risk_index)
    " | TARGET: 115,000+ | 8_ROBOT_STRATEGY"))