/* ==========================================================================
   ふるさと納税 上限額シミュレーター スクリプト (前半)
   ========================================================================== */

// --- 1. タブ切り替え機能 ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const btn = document.getElementById(`tab-btn-${tabName}`);
    const content = document.getElementById(`tab-${tabName}`);
    if (btn && content) {
        btn.classList.add('active');
        content.classList.add('active');
    }
}

// --- 2. CSV 保存・読込・リセット機能 ---
function exportCSV() {
    const ids = [
        'detail-salary', 'detail-social', 'detail-family', 'detail-prefecture',
        'detail-medical', 'detail-life-insurance', 'detail-earthquake-insurance',
        'detail-pension-type', 'detail-dc-employer', 'detail-ideco',
        'detail-mortgage-balance', 'detail-is-first-year'
    ];
    let csvContent = "data:text/csv;charset=utf-8,項目,値\n";
    ids.forEach(id => {
        const el = document.getElementById(id);
        const val = el ? el.value : '';
        csvContent += `${id},${val}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "furusato_simulation_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const lines = e.target.result.split('\n');
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const id = parts[0].trim();
                const val = parts[1].trim();
                const el = document.getElementById(id);
                if (el) el.value = val;
            }
        });
        updateIdecoMax();
        calculate();
    };
    reader.readAsText(file);
}

function resetForm() {
    const inputs = document.querySelectorAll('input[type="number"], input[type="text"]');
    inputs.forEach(input => input.value = '');
    document.getElementById('result-section').classList.add('hidden');
    updateIdecoMax();
}

// --- 3. 社会保険料の概算自動入力（約15%目安） ---
function autoFillSocialInsurance() {
    const salary = Number(document.getElementById('detail-salary').value) || 0;
    if (salary > 0) {
        // 標準的な給与所得者の社保率（健康＋厚生＋雇用で約15%）
        const estimatedSocial = Math.round(salary * 0.15);
        document.getElementById('detail-social').value = estimatedSocial;
        calculate();
    }
}

// --- 4. iDeCo 上限額判定ロジック ---
function updateIdecoMax() {
    const pType = document.getElementById('detail-pension-type').value;
    const dcGroup = document.getElementById('dc-amount-group');
    const limitText = document.getElementById('ideco-limit-text');
    let maxMonthly = 0;

    if (pType === 'none') {
        if (dcGroup) dcGroup.style.display = 'none';
        maxMonthly = 23000;
        limitText.innerText = `拠出可能上限：月額 23,000円（年額 276,000円）`;
    } else if (pType === 'dc_employee') {
        if (dcGroup) dcGroup.style.display = 'none';
        limitText.innerText = `企業型DCのみ加入の場合、原則iDeCoの併用はできません（掛金0円）`;
    } else {
        if (dcGroup) dcGroup.style.display = 'flex';
        const employerDC = Number(document.getElementById('detail-dc-employer').value) || 0;
        // 合算枠月額6.2万円から事業主掛金を差し引いた額（月額上限20,000円）
        const remaining = Math.max(0, 62000 - employerDC);
        maxMonthly = Math.min(20000, remaining);
        limitText.innerText = `拠出可能上限：月額 ${maxMonthly.toLocaleString()}円（年額 ${(maxMonthly * 12).toLocaleString()}円）※合算枠6.2万円基準`;
    }
}

// --- 5. 給与所得控除の計算 ---
function calcEmploymentIncomeDeduction(salary) {
    if (salary <= 1800000) {
        return Math.max(salary * 0.4 - 100000, 550000);
    } else if (salary <= 3600000) {
        return salary * 0.3 + 80000;
    } else if (salary <= 6600000) {
        return salary * 0.2 + 440000;
    } else if (salary <= 8500000) {
        return salary * 0.1 + 1100000;
    } else {
        return 1950000; // 上限
    }
}

// --- 6. 所得税率および控除額の算出 ---
function getIncomeTaxBracket(taxableIncome) {
    if (taxableIncome <= 1950000) return { rate: 0.05, deduction: 0 };
    if (taxableIncome <= 3300000) return { rate: 0.10, deduction: 97500 };
    if (taxableIncome <= 6950000) return { rate: 0.20, deduction: 427500 };
    if (taxableIncome <= 8999000) return { rate: 0.23, deduction: 636000 };
    if (taxableIncome <= 17999000) return { rate: 0.33, deduction: 1536000 };
    if (taxableIncome <= 39999000) return { rate: 0.40, deduction: 2796000 };
    return { rate: 0.45, deduction: 4796000 };
}

// --- 7. 生命保険料控除の計算（新制度） ---
function calcLifeInsuranceDeduction(premium, isResidentTax = false) {
    if (premium <= 0) return 0;
    if (!isResidentTax) {
        // 所得税（上限40,000円）
        if (premium <= 20000) return premium;
        if (premium <= 40000) return premium * 0.5 + 10000;
        if (premium <= 80000) return premium * 0.25 + 20000;
        return 40000;
    } else {
        // 住民税（上限28,000円）
        if (premium <= 12000) return premium;
        if (premium <= 32000) return premium * 0.5 + 6000;
        if (premium <= 56000) return premium * 0.25 + 14000;
        return 28000;
    }
}

// --- 8. 詳細計算メイン処理 ---
function calculate() {
    const salary = Number(document.getElementById('detail-salary').value) || 0;
    if (salary <= 0) {
        document.getElementById('result-section').classList.add('hidden');
        return;
    }

    const social = Number(document.getElementById('detail-social').value) || 0;
    const family = document.getElementById('detail-family').value;
    const prefType = document.getElementById('detail-prefecture').value;
    const medical = Number(document.getElementById('detail-medical').value) || 0;
    const lifeIns = Number(document.getElementById('detail-life-insurance').value) || 0;
    const earthquakeIns = Number(document.getElementById('detail-earthquake-insurance').value) || 0;
    const ideco = Number(document.getElementById('detail-ideco').value) || 0;
    const mortgageBalance = Number(document.getElementById('detail-mortgage-balance').value) || 0;
    const isFirstYear = document.getElementById('detail-is-first-year').value;

    // 給与所得
    const empDeduction = calcEmploymentIncomeDeduction(salary);
    const employmentIncome = Math.max(0, salary - empDeduction);

    // 医療費控除額の算出（10万円 または 総所得等の5% の低い方を超える額）
    const medicalThreshold = Math.min(100000, employmentIncome * 0.05);
    const medicalDeduction = Math.max(0, medical - medicalThreshold);

    // 基礎控除（合計所得金額2,400万円以下を想定）
    const baseDeductionIT = 480000; // 所得税
    const baseDeductionRT = 430000; // 住民税

    // 人的控除
    let spouseDeductionIT = 0;
    let spouseDeductionRT = 0;
    let dependentDeductionIT = 0;
    let dependentDeductionRT = 0;

    if (family === 'single') {
        // 独身 or 共働き（配偶者控除なし）
        spouseDeductionIT = 0;
        spouseDeductionRT = 0;
    } else if (family === 'spouse_no_income') {
        // 配偶者あり（収入なし または 103万円以下）
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
    } else if (family === 'spouse_part_time') {
        // 配偶者あり（年収103万超〜201万円以下）
        spouseDeductionIT = Math.max(0, 380000 - (Math.floor(employmentIncome * 0.05) - 1030000) / 2); // 配偶者控除
        spouseDeductionRT = Math.max(0, 330000 - (Math.floor(employmentIncome * 0.05) - 1030000) / 2); // 配偶者住民税控除
    } else if (family === 'child_highschool') {
        // 配偶者（収入なし）＋ 高校生の子ども1人
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 380000;
        dependentDeductionRT = 330000;
    } else if (family === 'child_college') {
        // 配偶者（収入なし）＋ 大学生等の子ども1人（19〜22歳）
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 630000;
        dependentDeductionRT = 450000;
    } else if (family === 'child_two') {
        // 配偶者（収入なし）＋ 高校生1人 ＋ 大学生1人
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 380000 + 630000; // 高校生 + 大学生
        dependentDeductionRT = 330000 + 450000; // 高校生 + 大学生
    }

    // 保険料控除
    const lifeIT = calcLifeInsuranceDeduction(lifeIns, false);
    const lifeRT = calcLifeInsuranceDeduction(lifeIns, true);
    const earthIT = Math.min(50000, earthquakeIns);
    const earthRT = Math.min(25000, Math.round(earthquakeIns * 0.5));

    // 所得控除合計
    const totalDeductionIT = social + medicalDeduction + baseDeductionIT +
        spouseDeductionIT + dependentDeductionIT + lifeIT + earthIT + ideco;
    const totalDeductionRT = social + medicalDeduction + baseDeductionRT +
        spouseDeductionRT + dependentDeductionRT + lifeRT + earthRT + ideco;

    // 課税所得金額（千円未満切り捨て）
    const taxableIncomeIT = Math.max(0, Math.floor((employmentIncome - totalDeductionIT) / 1000) * 1000);
    const taxableIncomeRT = Math.max(0, Math.floor((employmentIncome - totalDeductionRT) / 1000) * 1000);

    // 所得税率
    const bracket = getIncomeTaxBracket(taxableIncomeIT);
    const incomeTaxRate = bracket.rate;

    // 復興特別所得税を考慮した所得税額
    const baseIncomeTax = Math.max(0, Math.floor(taxableIncomeIT * bracket.rate - bracket.deduction));
    const reconstructionSurtax = Math.floor(baseIncomeTax * 0.021);
    const finalIncomeTaxBeforeMortgage = baseIncomeTax + reconstructionSurtax;

    // 住民税所得割額（標準税率10%）
    // 調整控除（人的控除の差等による控除：課税所得200万以下は差額等の5%、超は簡易に2,500円控除で近似）
    let adjDeduction = 2500;
    const personDeductionDiff = (spouseDeductionRT + dependentDeductionRT) - (spouseDeductionIT + dependentDeductionIT);
    if (taxableIncomeRT <= 2000000) {
        adjDeduction = Math.min(50000, Math.max(0, personDeductionDiff));
    } else {
        adjDeduction = Math.min(2500, Math.max(0, personDeductionDiff));
    }
    const residentTaxIncomePart = Math.max(0, Math.round(taxableIncomeRT * 0.10 - adjDeduction));

    // 住宅ローン控除可能額の算定（借入限度4,000万円・控除率0.7%・上限28万円）
    const eligibleMortgageBalance = Math.min(40000000, mortgageBalance);
    const mortgageCreditLimit = Math.floor(eligibleMortgageBalance * 0.007);

    // 所得税からの住宅ローン控除
    const itMortgageUsed = Math.min(finalIncomeTaxBeforeMortgage, mortgageCreditLimit);
    const remainingMortgageCredit = mortgageCreditLimit - itMortgageUsed;

    // 住民税からの住宅ローン控除（上限97,500円または課税所得等の5%）
    const rtMortgageLimit = Math.min(97500, Math.floor(taxableIncomeRT * 0.05));
    const rtMortgageUsed = Math.min(residentTaxIncomePart, rtMortgageLimit);

    // 最終的な所得税・住民税額
    const finalIncomeTax = Math.max(0, finalIncomeTaxBeforeMortgage - itMortgageUsed);
    const finalResidentTax = Math.max(0, residentTaxIncomePart - rtMortgageUsed);
    const totalTax = finalIncomeTax + finalResidentTax;

    // ふるさと納税 控除上限額の計算
    // 所得税からの控除分 + 住民税からの控除分（所得割額の20%）
    // 住宅ローン控除初年度は確定申告が必要なため、ふるさと納税も確定申告で合算。
    const donationLimitByIT = Math.floor((finalIncomeTax + (isFirstYear === 'first' ? remainingMortgageCredit : 0)) * 1.021); // 復興特別所得税考慮
    const donationLimitByRT = Math.floor(residentTaxIncomePart * 0.20);
    const donationMax = Math.min(donationLimitByIT, donationLimitByRT);

    // 結果表示
    const resultSection = document.getElementById('result-section');
    document.getElementById('result-max-donation').innerText = donationMax.toLocaleString() + ' 円';

    // 住民税所得割額の補足表示
    const residentTaxBasisElement = document.getElementById('resident-tax-basis');
    if (residentTaxBasisElement) {
        residentTaxBasisElement.innerHTML = `※住民税所得割額（概算）： ${residentTaxIncomePart.toLocaleString()} 円（上限計算の根拠の一部です）`;
    }

    resultSection.classList.remove('hidden');

    // 申請方法判定
    let applicationMethod = "年末調整・ワンストップ特例制度で完結可能";
    if (isFirstYear === 'first' || medical > medicalThreshold || ideco > 0 || lifeIns > 0 || earthquakeIns > 0 || family.startsWith('child')) {
        // 初年度、医療費控除、iDeCo、保険料控除、扶養家族ありの場合は確定申告が必要
        applicationMethod = "確定申告が必要";
    }
    document.getElementById('application-method-result').innerText = applicationMethod;
}

// --- 9. 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    switchTab('detail'); // 初期タブ設定
    updateIdecoMax(); // iDeCo上限初期表示
    // 初期状態では計算ボタンを押すまで結果を表示しない
    document.getElementById('result-section').classList.add('hidden');
});

// --- 10. 住宅ローン控除関連の補助関数 ---
function updateMortgageDetails() {
    const acquisitionYear = document.getElementById('detail-mortgage-acquisition-year').value;
    const mortgageType = document.getElementById('detail-mortgage-type').value;
    const isFirstYear = document.getElementById('detail-mortgage-is-first-year').value;

    let loanLimit = 0; // 借入限度額

    // 住宅の種類・性能と入居年による借入限度額の判定
    if (acquisitionYear === '2022_2023') {
        if (mortgageType === 'high_standard_new') loanLimit = 50000000; // 長期優良・ZEH新築
        else if (mortgageType === 'standard_new') loanLimit = 45000000; // 省エネ基準適合新築
        else if (mortgageType === 'high_standard_old') loanLimit = 45000000; // 長期優良・ZEH中古
        else if (mortgageType === 'standard_old') loanLimit = 35000000; // 省エネ基準適合中古
        else if (mortgageType === 'general_new') loanLimit = 40000000; // 一般新築
    } else if (acquisitionYear === '2024_2025') {
        // 2024年以降は一般住宅（新築・中古）は原則対象外
        if (mortgageType === 'high_standard_new') loanLimit = 45000000; // 長期優良・ZEH新築
        else if (mortgageType === 'standard_new') loanLimit = 35000000; // 省エネ基準適合新築
        else if (mortgageType === 'high_standard_old') loanLimit = 35000000; // 長期優良・ZEH中古
        else if (mortgageType === 'standard_old') loanLimit = 20000000; // 省エネ基準適合中古
        // general_new はここでは考慮しない（対象外のため）
    } else if (acquisitionYear === '2026_2030') {
        // 2026年以降の基準で借入限度額を設定
        if (mortgageType === 'high_standard_new') loanLimit = 50000000; 
        else if (mortgageType === 'standard_new') loanLimit = 30000000; 
        // ※実際は詳細な住宅種別ごとに表を参照して値を設定してください
    }

    // 子育て世帯・若者夫婦世帯特例（2024年入居）
    // ※HTML側で選択肢を細分化できないため、ここでは簡易的に「high_standard_new」等で判断。
    //   実際には、年齢や子どもの有無などの情報が必要。
    //   ここでは、2024年入居かつ、特定タイプの住宅なら上限が維持されると仮定。
    if (acquisitionYear === '2024_2025') {
        const family = document.getElementById('detail-family').value;
        const isChildFamily = family.startsWith('child');
        if (isChildFamily) {
            // 子育て世帯等の場合は2023年水準の上限額を維持
            if (mortgageType === 'high_standard_new') loanLimit = 50000000;
            else if (mortgageType === 'standard_new') loanLimit = 40000000;
        }
    }

    return loanLimit;
}

// --- 11. 詳細計算メイン処理 ---
function calculate() {
    const salary = Number(document.getElementById('detail-salary').value) || 0;
    if (salary <= 0) {
        document.getElementById('result-section').classList.add('hidden');
        return;
    }

    const social = Number(document.getElementById('detail-social').value) || 0;
    const family = document.getElementById('detail-family').value;
    const prefType = document.getElementById('detail-prefecture').value;
    const medical = Number(document.getElementById('detail-medical').value) || 0;
    const lifeIns = Number(document.getElementById('detail-life-insurance').value) || 0;
    const earthquakeIns = Number(document.getElementById('detail-earthquake-insurance').value) || 0;
    const ideco = Number(document.getElementById('detail-ideco').value) || 0;
    const mortgageBalance = Number(document.getElementById('detail-mortgage-balance').value) || 0;
    const isFirstYear = document.getElementById('detail-mortgage-is-first-year').value;

    // 給与所得の算出
    const empDeduction = calcEmploymentIncomeDeduction(salary);
    const employmentIncome = Math.max(0, salary - empDeduction);

    // 医療費控除額の算出（10万円 または 総所得等の5% の低い方を超える額）
    const medicalThreshold = Math.min(100000, employmentIncome * 0.05);
    const medicalDeduction = Math.max(0, medical - medicalThreshold);

    // 基礎控除（合計所得金額2,400万円以下を想定）
    const baseDeductionIT = 480000; // 所得税
    const baseDeductionRT = 430000; // 住民税

    // 人的控除
    let spouseDeductionIT = 0;
    let spouseDeductionRT = 0;
    let dependentDeductionIT = 0;
    let dependentDeductionRT = 0;

    if (family === 'single') {
        spouseDeductionIT = 0;
        spouseDeductionRT = 0;
    } else if (family === 'spouse_no_income') {
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
    } else if (family === 'spouse_part_time') {
        spouseDeductionIT = 380000; // 配偶者特別控除（満額目安）
        spouseDeductionRT = 330000;
    } else if (family === 'child_highschool') {
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 380000;
        dependentDeductionRT = 330000;
    } else if (family === 'child_college') {
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 630000;
        dependentDeductionRT = 450000;
    } else if (family === 'child_two') {
        spouseDeductionIT = 380000;
        spouseDeductionRT = 330000;
        dependentDeductionIT = 380000 + 630000;
        dependentDeductionRT = 330000 + 450000;
    }

    // 保険料控除
    const lifeIT = calcLifeInsuranceDeduction(lifeIns, false);
    const lifeRT = calcLifeInsuranceDeduction(lifeIns, true);
    const earthIT = Math.min(50000, earthquakeIns);
    const earthRT = Math.min(25000, Math.round(earthquakeIns * 0.5));

    // 所得控除合計
    const totalDeductionIT = social + medicalDeduction + baseDeductionIT +
        spouseDeductionIT + dependentDeductionIT + lifeIT + earthIT + ideco;
    const totalDeductionRT = social + medicalDeduction + baseDeductionRT +
        spouseDeductionRT + dependentDeductionRT + lifeRT + earthRT + ideco;

    // 課税所得金額（千円未満切り捨て）
    const taxableIncomeIT = Math.max(0, Math.floor((employmentIncome - totalDeductionIT) / 1000) * 1000);
    const taxableIncomeRT = Math.max(0, Math.floor((employmentIncome - totalDeductionRT) / 1000) * 1000);

    // 所得税率・所得税額（住宅ローン控除前）
    const bracket = getIncomeTaxBracket(taxableIncomeIT);
    const baseIncomeTax = Math.max(0, Math.floor(taxableIncomeIT * bracket.rate - bracket.deduction));
    const reconstructionTaxRate = 0.021;

    // 住民税所得割額（標準税率10%）
    let adjDeduction = 2500;
    const personDeductionDiff = (spouseDeductionRT + dependentDeductionRT) - (spouseDeductionIT + dependentDeductionIT);
    if (taxableIncomeRT <= 2000000) {
        adjDeduction = Math.min(50000, Math.max(0, personDeductionDiff));
    } else {
        adjDeduction = Math.min(2500, Math.max(0, personDeductionDiff));
    }
    const residentTaxIncomePart = Math.max(0, Math.round(taxableIncomeRT * 0.10 - adjDeduction));

    // 住宅ローン控除額の厳密計算
    let totalMortgageDeduction = 0;
    let itMortgageUsed = 0;
    let rtMortgageUsed = 0;

    if (mortgageBalance > 0) {
        const loanLimit = updateMortgageDetails();
        const eligibleBalance = Math.min(loanLimit, mortgageBalance);
        const mortgageCreditRate = 0.007; // 控除率 0.7%
        const maxCredit = Math.floor(eligibleBalance * mortgageCreditRate);

        // ① 所得税からの控除
        itMortgageUsed = Math.min(baseIncomeTax, maxCredit);
        const remainingCredit = maxCredit - itMortgageUsed;

        // ② 住民税からの控除限度額（前年課税所得の5% または 上限97,500円）
        const rtMortgageLimit = Math.min(97500, Math.floor(taxableIncomeRT * 0.05));
        rtMortgageUsed = Math.min(remainingCredit, rtMortgageLimit, residentTaxIncomePart);

        totalMortgageDeduction = itMortgageUsed + rtMortgageUsed;
    }

    // ふるさと納税 特例控除額の計算
    // 住民税所得割額の20%が特例控除上限
    const rtSpecialLimit = Math.floor(residentTaxIncomePart * 0.20);
    // 寄附金控除の掛け率: 100% - 10%(住民税) - 所得税率×1.021
    const factor = 1 - 0.10 - (bracket.rate * (1 + reconstructionTaxRate));
    let donationMax = 0;
    if (factor > 0) {
        donationMax = Math.floor((rtSpecialLimit / factor) + 2000);
    } else {
        donationMax = Math.floor(rtSpecialLimit + 2000);
    }

    // 住宅ローン控除とふるさと納税の干渉調整（ワンストップ特例 vs 確定申告）
    // 確定申告の場合、住宅ローン控除と所得税側で競合して上限額が目減りするケースを反映
    if (isFirstYear === 'first' && mortgageBalance > 0) {
        const taxableIncomeAfterMortgage = Math.max(0, baseIncomeTax - itMortgageUsed);
        if (taxableIncomeAfterMortgage === 0 && rtMortgageUsed >= 97500) {
            donationMax = Math.max(2000, Math.floor(donationMax * 0.85));
        }
    }

    // 結果表示
    const resultSection = document.getElementById('result-section');
    document.getElementById('result-mortgage-deduction').innerText = totalMortgageDeduction.toLocaleString() + ' 円';
    document.getElementById('result-max-donation').innerText = donationMax.toLocaleString() + ' 円';

    // 根拠のテキスト表示
    const residentTaxBasisElement = document.getElementById('resident-tax-basis');
    if (residentTaxBasisElement) {
        residentTaxBasisElement.innerHTML = `※住民税所得割額（概算）： ${residentTaxIncomePart.toLocaleString()} 円（特例控除限度額： ${rtSpecialLimit.toLocaleString()} 円）`;
    }

    const mortgageBasisElement = document.getElementById('mortgage-basis');
    if (mortgageBasisElement) {
        if (mortgageBalance > 0) {
            const loanLimit = updateMortgageDetails();
            mortgageBasisElement.innerHTML = `※住宅ローン控除内訳： 所得税控除 ${itMortgageUsed.toLocaleString()} 円 ＋ 住民税控除 ${rtMortgageUsed.toLocaleString()} 円（借入限度額 ${loanLimit.toLocaleString()} 円を適用）`;
        } else {
            mortgageBasisElement.innerHTML = `※住宅ローン控除の適用はありません。`;
        }
    }

    resultSection.classList.remove('hidden');

    // 申請方法判定
    let applicationMethod = "ワンストップ特例制度が利用可能（寄附先5自治体以内の場合）";
    let isKakutei = false;

    if (isFirstYear === 'first' && mortgageBalance > 0) {
        applicationMethod = "確定申告が必要（住宅ローン控除1年目のため）";
        isKakutei = true;
    } else if (medical > medicalThreshold) {
        applicationMethod = "確定申告が必要（医療費控除を適用するため）";
        isKakutei = true;
    }

    const appBadge = document.getElementById('application-method-result');
    if (appBadge) {
        appBadge.innerText = applicationMethod;
        if (isKakutei) {
            appBadge.style.backgroundColor = '#dc2626'; // 赤色（確定申告）
        } else {
            appBadge.style.backgroundColor = '#0d9488'; // 緑色（ワンストップ可能）
        }
    }
}

// --- 12. 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    switchTab('detail');
    updateIdecoMax();
    const resultSection = document.getElementById('result-section');
    if (resultSection) {
        resultSection.classList.add('hidden');
    }
});