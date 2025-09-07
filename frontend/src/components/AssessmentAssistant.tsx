import { useState, useEffect } from "react";
import { assessmentItems } from "../lib/assessmentItems";
import { useClientContext } from "./ClientContext";
import { assessmentsApi } from "../lib/api-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function AssessmentAssistant() {
  const [assessmentResult] = useState("");
  const [assessmentLoading] = useState(false);
  const [assessmentError] = useState<string | null>(null);
  const {
    currentClient,
    assessmentEditSignal,
    assessmentEditTarget,
    notifyAssessmentUpdated,
  } = useClientContext();

  type MappedResult = Record<
    string,
    Record<string, string | Record<string, string>>
  >;

  const [mappedResult, setMappedResult] = useState<MappedResult | null>(null);
  const [existingAssessment, setExistingAssessment] =
    useState<MappedResult | null>(null);
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [existingVersion, setExistingVersion] = useState<number | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [showCreation, setShowCreation] = useState(false);
  const [script, setScript] =
    useState(`支援者（田中 健一、45歳）: 相談に来て、少し緊張しています。よろしくお願いします。

社会福祉士: 田中さん、本日はお越しいただきありがとうございます。どうぞ、楽にお話しください。本日はどのようなことでお困りでしょうか？

田中: ええと...実は、数年前に会社をリストラされてから、ずっと仕事が見つからないんです。年齢のせいか、書類選考で落ちてしまうことが多くて。最初は頑張ろうと思っていたんですが、最近はもうどうしていいか分からなくなってしまって...。

社会福祉士: そうですか、それは大変でしたね。これまで、どのようなお仕事をされていましたか？

田中: 以前は、小さな町工場で旋盤工をしていました。勤続20年で、機械の扱いには自信があります。細かい作業も得意で、手先は器用な方だと思います。ただ、パソコンはほとんど使ったことがなくて...。

社会福祉士: 旋盤工として20年も経験を積んでこられたのですね。それは素晴らしい強みです。仕事を探す上で、何か希望はありますか？

田中: できれば、また製造業に関わる仕事に就きたいです。でも、今の状況だと、清掃や警備の仕事でも、とにかく安定した収入が欲しいと思っています。

社会福祉士: 収入面での不安が大きいとのこと、承知いたしました。生活のことでお困りごとはありますか？

田中: 家賃の支払いが厳しくなってきていて、貯金もほとんど底をつきました。食事もまともにとれていない日があって、体調もすぐれません。このままだと、家を追い出されてしまうんじゃないかと不安です...。

社会福祉士: 生活の基盤が不安定な状況なのですね。お話しいただきありがとうございます。一つずつ、一緒に解決策を考えていきましょう。ご家族はいらっしゃいますか？

田中: 離婚して、今は一人暮らしです。遠方に住んでいる母親がいますが、高齢なので心配はかけたくありません。

社会福祉士: 承知いたしました。本日はたくさんお話しいいただきありがとうございました。本日お伺いした内容を元に、まずは生活を安定させるための支援と、田中さんの得意なことを活かせる就労支援について、一緒に計画を立てていきましょう。`);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  // Editing states
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveEditMessage, setSaveEditMessage] = useState<string | null>(null);

  // Change history
  interface ChangeEntry {
    id: string;
    path: string;
    oldValue: string;
    newValue: string;
    userId: string;
    createdAt?: string;
  }
  const [history, setHistory] = useState<ChangeEntry[]>([]);
  const [historyLoading] = useState(false);
  const [historyError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleMapAssessment = async () => {
    if (!script.trim()) {
      setMappingError("スクリプトを入力してください。");
      return;
    }
    setMappingLoading(true);
    setMappingError(null);
    setMappedResult(null);

    try {
      const mapRes = await fetch(`${API_BASE_URL}/assessment/map/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_content: script,
          assessment_items: assessmentItems,
        }),
      });
      const mapData = await mapRes.json();
      if (mapRes.ok) {
        setMappedResult(mapData);
      } else {
        setMappingError(mapData.detail || "自動整理に失敗しました。");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setMappingError(
          error.message || "APIへの接続中にエラーが発生しました。",
        );
      } else {
        setMappingError("APIへの接続中にエラーが発生しました。");
      }
    } finally {
      setMappingLoading(false);
    }
  };

  const handleResultChange = (
    form: string,
    category: string,
    subCategory: string | null,
    value: string,
  ) => {
    setMappedResult((prev: MappedResult | null) => {
      const newResult = { ...prev };
      if (subCategory) {
        if (
          typeof newResult[form][category] === "object" &&
          newResult[form][category] !== null
        ) {
          (newResult[form][category] as Record<string, string>)[subCategory] =
            value;
        }
      } else {
        newResult[form][category] = value;
      }
      return newResult;
    });
  };

  const handleSaveAssessment = async () => {
    if (!currentClient) {
      setMappingError("結果を保存する支援者を選択してください。");
      return;
    }
    if (!mappedResult) {
      setMappingError("保存するデータがありません。");
      return;
    }

    try {
      const assessment = await assessmentsApi.create({
        client_name: currentClient.name,
        assessment: mappedResult,
        original_script: script,
      });

      // 保存後は既存表示モードへ移行
      setExistingAssessment(mappedResult);
      setExistingDocId(assessment.id);
      setExistingVersion(assessment.version);
      setMappedResult(null);
      alert(`アセスメント結果が保存されました。 (ID: ${assessment.id})`);

      // Signal other views to refetch latest assessment
      notifyAssessmentUpdated();
      setShowCreation(false);
      await fetchExistingAssessment();
    } catch (error) {
      console.error("Error saving assessment: ", error);
      setMappingError("アセスメント結果の保存に失敗しました。");
    }
  };

  // 既存アセスメント読込
  const fetchExistingAssessment = async () => {
    if (!currentClient) {
      setExistingAssessment(null);
      setExistingDocId(null);
      return;
    }
    setExistingLoading(true);
    setExistingError(null);

    try {
      const assessments = await assessmentsApi.getAll(currentClient.name);

      if (assessments.length === 0) {
        setExistingAssessment(null);
        setExistingDocId(null);
        setExistingVersion(null);
      } else {
        // Sort by creation date (newest first) - API should already return them sorted
        const latest = assessments[0];
        setExistingAssessment(latest.assessment as MappedResult);
        setExistingDocId(latest.id);
        setExistingVersion(latest.version);
      }
    } catch (error) {
      console.error(error);
      setExistingError("既存アセスメントの取得に失敗しました");
    } finally {
      setExistingLoading(false);
    }
  };

  useEffect(() => {
    fetchExistingAssessment();
  }, [currentClient]);

  // 履歴は今のところAPIエンドポイントがないのでスキップ
  useEffect(() => {
    // History loading would go here if we had an API endpoint
    setHistory([]);
  }, [existingDocId, currentClient]);

  // 編集開始
  const startEdit = () => {
    if (!existingAssessment) return;
    const flat: Record<string, string> = {};
    for (const [form, cats] of Object.entries(existingAssessment)) {
      for (const [cat, val] of Object.entries(cats)) {
        if (typeof val === "string") flat[`${form}|${cat}`] = val;
        else
          for (const [sub, subVal] of Object.entries(
            val as Record<string, string>,
          ))
            flat[`${form}|${cat}|${sub}`] = subVal;
      }
    }
    setEditBuffer(flat);
    setEditing(true);
    setSaveEditMessage(null);
  };

  const handleEditedChange = (
    form: string,
    category: string,
    sub: string | null,
    value: string,
  ) => {
    const key = sub ? `${form}|${category}|${sub}` : `${form}|${category}`;
    setEditBuffer((prev) => ({ ...prev, [key]: value }));
  };

  // 差分抽出
  interface FieldChange {
    path: string;
    oldValue: string;
    newValue: string;
  }
  const diffAssessments = (
    before: MappedResult,
    after: MappedResult,
  ): FieldChange[] => {
    const changes: FieldChange[] = [];
    for (const [form, categories] of Object.entries(after)) {
      const beforeForm = before[form] || {};
      for (const [category, value] of Object.entries(categories)) {
        const beforeVal = beforeForm[category];
        if (typeof value === "string") {
          const oldStr = typeof beforeVal === "string" ? beforeVal : "";
          if (oldStr !== value)
            changes.push({
              path: `${form} > ${category}`,
              oldValue: oldStr,
              newValue: value,
            });
        } else {
          // object
          const valueObj = value as Record<string, string>;
          const beforeObj =
            beforeVal && typeof beforeVal === "object"
              ? (beforeVal as Record<string, string>)
              : {};
          for (const [sub, subVal] of Object.entries(valueObj)) {
            const oldSub = beforeObj[sub] || "";
            if (oldSub !== subVal)
              changes.push({
                path: `${form} > ${category} > ${sub}`,
                oldValue: oldSub,
                newValue: subVal,
              });
          }
        }
      }
    }
    return changes;
  };

  const saveEdits = async () => {
    if (!currentClient || !existingDocId || !existingAssessment) return;

    // reconstruct
    const reconstructed: MappedResult = JSON.parse(
      JSON.stringify(existingAssessment),
    );
    for (const [key, val] of Object.entries(editBuffer)) {
      const parts = key.split("|");
      const [form, cat, sub] = parts;
      if (!reconstructed[form])
        reconstructed[form] = {} as Record<
          string,
          string | Record<string, string>
        >;
      if (sub) {
        if (
          typeof reconstructed[form][cat] !== "object" ||
          reconstructed[form][cat] === null
        ) {
          reconstructed[form][cat] = {} as Record<string, string>;
        }
        (reconstructed[form][cat] as Record<string, string>)[sub] = val;
      } else {
        reconstructed[form][cat] = val;
      }
    }

    const changes = diffAssessments(existingAssessment, reconstructed);
    if (changes.length === 0) {
      setSaveEditMessage("変更はありません");
      setEditing(false);
      return;
    }

    setSavingEdit(true);
    setSaveEditMessage(null);

    try {
      const updated = await assessmentsApi.update(existingDocId, {
        assessment: reconstructed,
      });

      setExistingAssessment(reconstructed);
      setExistingVersion(updated.version);
      setEditing(false);
      setSaveEditMessage(
        `${changes.length}件の変更を保存しました (v${updated.version})`,
      );
    } catch (error) {
      console.error(error);
      setSaveEditMessage("保存中にエラーが発生しました");
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditBuffer({});
    setSaveEditMessage(null);
  };

  // 外部からの編集リクエストを監視
  useEffect(() => {
    if (!assessmentEditSignal) return;
    if (existingAssessment) {
      startEdit();
      // Scroll to target if specified
      if (assessmentEditTarget?.category) {
        setTimeout(() => {
          let el: Element | null = null;
          if (
            typeof window !== "undefined" &&
            typeof document !== "undefined"
          ) {
            el = document.querySelector(
              `[data-assessment-category="${assessmentEditTarget.category}"]`,
            );
          }
          if (el)
            (el as HTMLElement).scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        }, 50);
      }
    }
  }, [assessmentEditSignal]);

  // 既存があれば読み取り専用表示
  if (existingAssessment && !showCreation) {
    const displayData = existingAssessment;
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold section-title">
            保存済みアセスメント
            {existingVersion ? ` (v${existingVersion})` : ""}
          </h2>
          <div className="flex gap-2">
            {existingDocId && (
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="gbtn text text-xs h-8"
              >
                {showHistory ? "履歴を隠す" : "変更履歴"}
              </button>
            )}
            {!editing && (
              <button onClick={startEdit} className="gbtn primary text-xs h-8">
                編集
              </button>
            )}
            {editing && (
              <>
                <button
                  disabled={savingEdit}
                  onClick={saveEdits}
                  className="gbtn primary text-xs h-8 disabled:opacity-60"
                >
                  {savingEdit ? "保存中..." : "変更を保存"}
                </button>
                <button
                  disabled={savingEdit}
                  onClick={cancelEdit}
                  className="gbtn text text-xs h-8 disabled:opacity-60"
                >
                  キャンセル
                </button>
              </>
            )}
          </div>
        </div>
        {saveEditMessage && (
          <p className="text-xs mb-2 text-[var(--muted)]">{saveEditMessage}</p>
        )}
        {currentClient && (
          <div className="text-sm text-[var(--foreground)] mb-3">
            対象支援者:{" "}
            <span className="font-semibold">{currentClient.name}</span>
          </div>
        )}
        {existingLoading && (
          <p className="text-xs text-[var(--muted)]">読み込み中...</p>
        )}
        {existingError && (
          <p className="text-xs text-red-500">{existingError}</p>
        )}

        {showHistory && (
          <div className="mb-6 surface card-shadow border border-[var(--border)] rounded-lg p-4 text-xs max-h-64 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm section-title">変更履歴</h3>
              {historyLoading && (
                <span className="text-[var(--muted)] text-[10px]">
                  更新中...
                </span>
              )}
            </div>
            {historyError && <p className="text-red-500">{historyError}</p>}
            {!historyLoading && history.length === 0 && (
              <p className="text-[var(--muted)] italic">
                履歴機能は現在実装されていません
              </p>
            )}
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="surface border border-[var(--border)] rounded p-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--foreground)]">
                      {h.path}
                    </span>
                    <span className="chip text-[10px]">
                      {h.createdAt
                        ? new Date(h.createdAt).toLocaleString("ja-JP")
                        : ""}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">旧</p>
                      <div className="whitespace-pre-wrap break-words max-h-24 overflow-auto">
                        {h.oldValue || "—"}
                      </div>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                      <p className="text-[10px] text-gray-400 mb-0.5">新</p>
                      <div className="whitespace-pre-wrap break-words max-h-24 overflow-auto">
                        {h.newValue || "—"}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!existingLoading && !existingError && displayData && (
          <div className="space-y-6">
            {Object.entries(displayData)
              .sort((a, b) => {
                const order = (name: string) => {
                  if (name.startsWith("様式1")) return 0;
                  if (name.startsWith("様式2")) return 1;
                  return 10;
                };
                const oa = order(a[0]);
                const ob = order(b[0]);
                if (oa !== ob) return oa - ob;
                return a[0].localeCompare(b[0], "ja");
              })
              .map(([form, categories]) => (
                <div
                  key={form}
                  className="surface card-shadow border border-gray-100 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-[var(--foreground)] section-title">
                      {form}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(
                      categories as Record<
                        string,
                        string | Record<string, string>
                      >,
                    ).map(([category, value]) => (
                      <div
                        key={category}
                        className="text-sm flex flex-col"
                        data-assessment-category={category}
                      >
                        <p className="font-semibold text-gray-700 mb-1">
                          {category}
                        </p>
                        {typeof value === "string" ? (
                          editing ? (
                            <textarea
                              value={
                                editBuffer[`${form}|${category}`] ?? value ?? ""
                              }
                              onChange={(e) =>
                                handleEditedChange(
                                  form,
                                  category,
                                  null,
                                  e.target.value,
                                )
                              }
                              className="rounded-lg border border-[var(--border)] p-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                              rows={3}
                            />
                          ) : (
                            <div className="bg-[var(--surface)] border border-[var(--border)] rounded p-2 whitespace-pre-wrap leading-relaxed text-[var(--foreground)] min-h-[3rem]">
                              {value || "—"}
                            </div>
                          )
                        ) : (
                          <div className="space-y-3">
                            {Object.entries(
                              value as Record<string, string>,
                            ).map(([sub, subVal]) => (
                              <div
                                key={sub}
                                className="border border-[var(--border)] rounded bg-[var(--chip-bg)] p-2"
                              >
                                <p className="text-[11px] font-semibold text-[var(--muted)] mb-1">
                                  {sub}
                                </p>
                                {editing ? (
                                  <textarea
                                    value={
                                      editBuffer[
                                        `${form}|${category}|${sub}`
                                      ] ??
                                      subVal ??
                                      ""
                                    }
                                    onChange={(e) =>
                                      handleEditedChange(
                                        form,
                                        category,
                                        sub,
                                        e.target.value,
                                      )
                                    }
                                    className="rounded-lg border border-[var(--border)] p-1 w-full text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                    rows={2}
                                  />
                                ) : (
                                  <div className="whitespace-pre-wrap leading-relaxed text-[var(--foreground)] text-[12px]">
                                    {subVal || "—"}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {!showCreation && (
        <div className="mb-6 surface card-shadow border border-gray-100 rounded-lg p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold section-title">
            保存されたアセスメントはありません
          </h2>
          <p className="text-sm text-[var(--muted)]">
            初回アセスメントを作成してください。AI
            が面談記録を解析して各項目へ自動整理します。
          </p>
          <div>
            <button
              onClick={() => setShowCreation(true)}
              disabled={!currentClient}
              className="gbtn primary text-sm disabled:opacity-60"
            >
              {currentClient
                ? "AIでアセスメントを作成"
                : "支援者を選択してください"}
            </button>
          </div>
        </div>
      )}
      {showCreation && (
        <h2 className="text-2xl font-semibold mb-4 section-title">
          面談記録からアセスメント項目を自動入力
        </h2>
      )}
      <div className="mb-4">
        {currentClient ? (
          <div className="text-sm text-gray-700">
            対象支援者:{" "}
            <span className="font-semibold">{currentClient.name}</span>
          </div>
        ) : (
          <div className="text-sm text-red-600">
            支援者が選択されていません。上部で支援者を選択してください。
          </div>
        )}
      </div>
      {showCreation && (
        <>
          {assessmentLoading && <p>AI提案を生成中...</p>}
          {assessmentError && <p className="text-red-500">{assessmentError}</p>}
          {assessmentResult && (
            <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">
              {assessmentResult}
            </div>
          )}
          <div>
            <div className="mb-4">
              <label htmlFor="script-textarea" className="font-bold mb-2 block">
                面談記録（スクリプト）
              </label>
              <textarea
                id="script-textarea"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={15}
                className="w-full rounded-lg border border-[var(--border)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="ここに面談記録を貼り付けてください..."
              />
            </div>
            <button
              className="gbtn primary mb-4 disabled:opacity-60"
              onClick={handleMapAssessment}
              disabled={mappingLoading || !currentClient}
            >
              {mappingLoading
                ? "反映中..."
                : currentClient
                  ? "アセスメント項目へ反映"
                  : "支援者を選択してください"}
            </button>
            {mappingError && (
              <p className="text-red-500 mb-4">{mappingError}</p>
            )}

            {mappedResult ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* 左側：元のスクリプト */}
                <div>
                  <h3 className="text-lg font-bold mb-2 section-title">
                    元の面談記録
                  </h3>
                  <div className="surface card-shadow border border-[var(--border)] rounded p-4 h-full overflow-auto text-sm">
                    <pre className="whitespace-pre-wrap">{script}</pre>
                  </div>
                </div>

                {/* 右側：編集可能なアセスメント項目 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold section-title">
                      AIによるアセスメント（編集可能）
                    </h3>
                    <button
                      onClick={handleSaveAssessment}
                      className="gbtn primary"
                    >
                      この内容で保存
                    </button>
                  </div>
                  <div className="space-y-6">
                    {Object.entries(mappedResult).map(([form, categories]) => (
                      <div
                        key={form}
                        className="surface card-shadow border border-[var(--border)] rounded-lg p-4"
                      >
                        <h4 className="text-md font-bold text-[var(--foreground)] section-title mb-2">
                          {form}
                        </h4>
                        <div className="space-y-4">
                          {Object.entries(
                            categories as Record<
                              string,
                              string | Record<string, string>
                            >,
                          ).map(([category, value]) => (
                            <div key={category}>
                              <label className="text-sm font-semibold text-[var(--muted)]">
                                {category}
                              </label>
                              {typeof value === "string" ? (
                                <textarea
                                  value={value}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLTextAreaElement>,
                                  ) =>
                                    handleResultChange(
                                      form,
                                      category,
                                      null,
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-lg border border-[var(--border)] p-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                  rows={3}
                                />
                              ) : (
                                <div className="pl-4 mt-1 space-y-2 border-l-2">
                                  {Object.entries(
                                    value as Record<string, string>,
                                  ).map(([subCategory, subValue]) => (
                                    <div key={subCategory}>
                                      <label className="text-sm font-semibold text-[var(--muted)]">
                                        {subCategory}
                                      </label>
                                      <textarea
                                        value={subValue as string}
                                        onChange={(
                                          e: React.ChangeEvent<HTMLTextAreaElement>,
                                        ) =>
                                          handleResultChange(
                                            form,
                                            category,
                                            subCategory,
                                            e.target.value,
                                          )
                                        }
                                        className="w-full rounded-lg border border-[var(--border)] p-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                                        rows={2}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="surface card-shadow border border-[var(--border)] rounded p-4 mt-4">
                <p className="text-center text-[var(--muted)]">
                  上記に面談記録を入力し、「アセスメント項目へ反映」ボタンを押してください。
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
