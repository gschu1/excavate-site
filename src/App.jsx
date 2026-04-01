import { useState, useEffect } from "react";

const FONTS_URL = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap";

// Prompt templates data
const PROMPTS = [
  {
    id: "triage",
    title: "The triage prompt",
    tier: "Start here",
    model: "Sonnet",
    description: "Run first. Scans your manifest and tells you where the richest material lives.",
    prompt: `Read the manifest file. This is an index of all conversations from an AI chat export.

Review the conversation titles, dates, and token counts. Produce a triage report with:

1. TIMELINE: When did the work begin and how did it evolve? What phases are visible?
2. BIGGEST CONVERSATIONS: The 20 largest by token count — these are likely the richest.
3. THEMATIC CLUSTERS: Group conversations by topic. What themes dominate?
4. RECOMMENDED PROCESSING ORDER: Which chunks should be read first?
5. ESTIMATED SESSIONS NEEDED: How many extraction sessions will this take?`
  },
  {
    id: "honest",
    title: "The honest assessment",
    tier: "Essential",
    model: "Opus",
    description: "The hardest prompt. Asks the AI to tell you what's genuinely valuable and what isn't.",
    prompt: `Read this conversation chunk. I need you to do something difficult: be genuinely honest about what you find. Do not be encouraging. Do not inflate the value of ideas.

I'm trying to figure out what in months of AI conversations is actually worth converting into real-world output — products, content, career moves — and what was intellectually stimulating but ultimately not convertible.

For this chunk, tell me:

1. WHAT'S GENUINELY ORIGINAL? Not "interesting" — original. Something a knowledgeable person in the field wouldn't have already thought of.
2. WHAT'S THE CLEAREST, MOST COMPELLING IDEA? Is it actually compelling, or does it just sound compelling?
3. WHAT CONCRETE DECISIONS WERE MADE THAT STILL HOLD UP?
4. WHAT WAS EXPLORATION THAT WENT NOWHERE? Be specific.
5. WHAT SURPRISED YOU?
6. HONEST OVERALL ASSESSMENT: If a smart investor or collaborator read this, what would they think?`
  },
  {
    id: "conversion",
    title: "The conversion scan",
    tier: "Core",
    model: "Opus",
    description: "Scans for ideas that are closest to becoming a real output — a blog post, a tool, a product.",
    prompt: `Read this conversation chunk. My north star is CONVERSION — turning ideas trapped in AI conversations into outputs that reach other humans.

For every substantial idea or project discussed, extract:

1. CONVERSION TARGET: What specific output could this become? Be concrete: "a blog post titled X", "a landing page for Y", "a pitch deck about Z".
2. CONVERSION READINESS (1-10): How close is this to being a finished, shippable output? 10 = needs final polish. 1 = raw ideation.
3. WHAT'S MISSING: What would need to be added to convert this? "needs examples", "needs a working demo", "needs to be cut from 5000 words to 1500".
4. ESTIMATED EFFORT: How many sessions / hours / tokens to finish?
5. VALUE ASSESSMENT: Who would care about this output? Why? Be honest — "only the author" is a valid answer.

Rank all findings by (readiness × value). The top items are the conversion queue.`
  },
  {
    id: "content",
    title: "The content mine",
    tier: "For publishers",
    model: "Sonnet → Opus",
    description: "Finds the 10 strongest ideas that could each become a published piece.",
    prompt: `Read this conversation chunk. I'm looking for PUBLISHABLE IDEAS — insights that would make a reader stop and think.

For each strong idea you find:
- TITLE: A working title for the piece
- HOOK: The opening line or question that would grab attention
- CORE ARGUMENT: 2-3 sentences
- FORMAT: Blog post / essay / X thread / LinkedIn post / newsletter
- TARGET AUDIENCE: Who specifically would share this?
- ORIGINALITY CHECK: Has this been said before? If so, what's different about this version?

Only include ideas that pass the "would someone share this?" test. Five genuinely publishable ideas are worth more than twenty mediocre ones.`
  },
  {
    id: "career",
    title: "The career extractor",
    tier: "For job seekers",
    model: "Sonnet",
    description: "Pulls out career strategy, positioning language, and ready-to-use professional materials.",
    prompt: `Read this conversation chunk. Extract everything that could become an actual career material or professional move.

1. POSITIONING LANGUAGE: How does the person describe their professional identity? Extract the best versions.
2. RESUME BULLETS: Specific accomplishments or capabilities that were discussed.
3. TARGET OPPORTUNITIES: Roles, companies, or opportunities mentioned. Status: pursued / abandoned / still relevant?
4. SKILLS DEMONSTRATED: What skills are evident from the conversation itself (not just discussed)?
5. NEXT ACTIONS: What concrete career moves should happen this week?

Be practical. A polished LinkedIn summary is worth more than a career philosophy.`
  },
  {
    id: "archive",
    title: "The archive builder",
    tier: "For researchers",
    model: "Sonnet",
    description: "Organizes theoretical or research work for future use without immediate conversion pressure.",
    prompt: `Read this conversation chunk. This contains theoretical or research work that may not convert immediately but should be preserved properly.

For each significant concept or framework:
- NAME: What is it called (or what should it be called)?
- DEFINITION: One-paragraph description in its most mature form.
- MATURITY: Sketch / Developed / Formalized / Validated
- DEPENDENCIES: Does this need external validation (e.g., mathematical proof, user testing)?
- FUTURE TRIGGER: Under what conditions would this become immediately valuable?

Organize as a structured reference document. No conversion pressure — just clean preservation.`
  }
];

// Cost calculator data
const MODELS = {
  opus: { name: "Opus", inputPer1M: 15, outputPer1M: 75, best: "Interpretive work, honest assessment, creative judgment" },
  sonnet: { name: "Sonnet", inputPer1M: 3, outputPer1M: 15, best: "Classification, structured extraction, triage" },
};

function CostCalculator() {
  const [tokens, setTokens] = useState(2);
  const [model, setModel] = useState("opus");
  const [sessions, setSessions] = useState(10);
  
  const inputTokens = tokens * 1_000_000;
  const outputRatio = 0.15;
  const outputTokens = inputTokens * outputRatio;
  const m = MODELS[model];
  const inputCost = (inputTokens / 1_000_000) * m.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * m.outputPer1M;
  const totalCost = inputCost + outputCost;
  const tokensPerSession = inputTokens / sessions;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "28px 32px" }}>
      <div style={{ display: "grid", gap: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
            Corpus size (million tokens)
          </label>
          <input
            type="range" min={0.5} max={20} step={0.5} value={tokens}
            onChange={e => setTokens(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
            <span>500K</span>
            <span style={{ fontSize: 18, color: "var(--text)", fontWeight: 600 }}>{tokens}M tokens</span>
            <span>20M</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {Object.entries(MODELS).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setModel(key)}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                border: model === key ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: model === key ? "var(--accent-light)" : "transparent",
                color: "var(--text)", fontFamily: "'DM Sans', sans-serif", fontSize: 14, textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{m.best}</div>
            </button>
          ))}
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
            Sessions: {sessions}
          </label>
          <input
            type="range" min={3} max={30} step={1} value={sessions}
            onChange={e => setSessions(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
            ~{Math.round(tokensPerSession / 1000)}K tokens per session
          </div>
        </div>

        <div style={{
          background: "var(--accent-light)", borderRadius: 8, padding: "20px 24px",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, textAlign: "center"
        }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>Input</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", fontFamily: "'DM Sans', sans-serif" }}>${inputCost.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>Output</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", fontFamily: "'DM Sans', sans-serif" }}>${outputCost.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--accent-dark)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Total</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "var(--accent-dark)", fontFamily: "'DM Sans', sans-serif" }}>${totalCost.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
          On a Max subscription, this is included but will need to be paced across {Math.ceil(sessions / 3)}-{Math.ceil(sessions / 2)} days.
        </div>
      </div>
    </div>
  );
}

function PromptCard({ prompt, isOpen, onToggle }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10,
      overflow: "hidden", transition: "all 0.2s ease"
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "18px 24px", background: isOpen ? "var(--surface)" : "transparent",
          border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between",
          alignItems: "center", textAlign: "left", color: "var(--text)"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 19 }}>{prompt.title}</span>
            <span style={{
              fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              padding: "2px 10px", borderRadius: 20,
              background: prompt.model === "Opus" ? "#5b3e1a22" : "#1a4a3e22",
              color: prompt.model === "Opus" ? "var(--accent-dark)" : "#1a6b52"
            }}>
              {prompt.model}
            </span>
            <span style={{
              fontSize: 11, fontFamily: "'DM Sans', sans-serif",
              padding: "2px 10px", borderRadius: 20,
              background: "var(--surface)", color: "var(--muted)"
            }}>
              {prompt.tier}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>
            {prompt.description}
          </div>
        </div>
        <span style={{ fontSize: 20, color: "var(--muted)", transform: isOpen ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
      </button>
      {isOpen && (
        <div style={{ padding: "0 24px 24px" }}>
          <pre style={{
            background: "#1a1917", color: "#e8e6df", padding: "20px 24px",
            borderRadius: 8, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
            fontFamily: "'DM Sans', sans-serif", overflowX: "auto",
            border: "1px solid #2a2825"
          }}>
            {prompt.prompt}
          </pre>
          <div style={{
            marginTop: 12, fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif",
            display: "flex", justifyContent: "space-between"
          }}>
            <span>Copy this prompt into Cowork with your chunk file</span>
            <button
              onClick={() => navigator.clipboard?.writeText(prompt.prompt)}
              style={{
                background: "var(--accent-light)", border: "1px solid var(--accent)",
                borderRadius: 6, padding: "4px 14px", cursor: "pointer",
                fontSize: 12, color: "var(--accent-dark)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ number, title, description, detail, tier }) {
  return (
    <div style={{
      padding: "28px 32px", border: "1px solid var(--border)", borderRadius: 12,
      background: "var(--surface)", position: "relative"
    }}>
      <div style={{
        position: "absolute", top: -14, left: 24,
        width: 28, height: 28, borderRadius: "50%",
        background: "var(--accent)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif"
      }}>
        {number}
      </div>
      {tier && (
        <div style={{
          position: "absolute", top: -10, right: 24, fontSize: 11,
          fontFamily: "'DM Sans', sans-serif", padding: "2px 10px", borderRadius: 20,
          background: tier === "Everyone" ? "var(--accent-light)" : "#1a4a3e22",
          color: tier === "Everyone" ? "var(--accent-dark)" : "#1a6b52"
        }}>
          {tier}
        </div>
      )}
      <h3 style={{
        fontFamily: "'Instrument Serif', serif", fontSize: 21, fontWeight: 400,
        margin: "4px 0 8px", color: "var(--text)"
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 15, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1.65, margin: 0
      }}>
        {description}
      </p>
      {detail && (
        <div style={{
          marginTop: 14, padding: "12px 16px", background: "var(--bg)",
          borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          color: "var(--muted)", lineHeight: 1.6
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

export default function Excavate() {
  const [openPrompt, setOpenPrompt] = useState(null);
  const [activeSection, setActiveSection] = useState("problem");

  useEffect(() => {
    const link = document.createElement("link");
    link.href = FONTS_URL;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const css = `
    :root {
      --bg: #f7f5f0;
      --surface: #fffef9;
      --text: #1a1917;
      --muted: #6b685e;
      --border: #d8d5cb;
      --accent: #9c6b30;
      --accent-dark: #6b4820;
      --accent-light: #f0e6d4;
      --section-gap: 80px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1917;
        --surface: #242320;
        --text: #e8e6df;
        --muted: #9c9a8e;
        --border: #3a3835;
        --accent: #c8943e;
        --accent-dark: #e8b458;
        --accent-light: #2e2518;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    ::selection { background: var(--accent-light); color: var(--accent-dark); }
    input[type="range"] { height: 4px; border-radius: 2px; }
  `;

  return (
    <>
      <style>{css}</style>
      <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
        
        {/* NAV */}
        <nav style={{
          padding: "16px 40px", display: "flex", justifyContent: "space-between",
          alignItems: "center", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, background: "var(--bg)", zIndex: 100
        }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>
            excavate
          </div>
          <div style={{ display: "flex", gap: 28, fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
            {[
              ["problem", "The problem"],
              ["method", "Method"],
              ["download", "Download"],
              ["prompts", "Prompts"],
              ["cost", "Cost"],
              ["philosophy", "Philosophy"],
              ["about", "About"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                style={{
                  color: "var(--muted)", textDecoration: "none",
                  borderBottom: activeSection === id ? "2px solid var(--accent)" : "2px solid transparent",
                  paddingBottom: 2, transition: "all 0.15s"
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>

          {/* HERO */}
          <section id="problem" style={{ paddingTop: 80, paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20
            }}>
              The conversion problem
            </div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 48, fontWeight: 400,
              lineHeight: 1.2, maxWidth: 600, marginBottom: 28
            }}>
              Your best ideas are trapped in chat logs.
            </h1>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 17, lineHeight: 1.75,
              color: "var(--muted)", maxWidth: 560
            }}>
              <p style={{ marginBottom: 16 }}>
                You've spent months talking to AI. Hundreds of conversations. Thousands of ideas explored,
                frameworks sketched, strategies debated, projects imagined. Some of it is genuinely brilliant.
                Some of it is elaborate intellectual exploration that went nowhere.
              </p>
              <p style={{ marginBottom: 16 }}>
                You know there's value in there. But you don't know where it is, what it's worth, 
                or how to turn it into something that exists outside the chat window — a product, 
                a published piece, a career move, a business.
              </p>
              <p>
                This is the conversion problem. And you're not alone.
              </p>
            </div>

            <div style={{
              marginTop: 40, padding: "24px 28px", borderLeft: "3px solid var(--accent)",
              background: "var(--surface)", borderRadius: "0 8px 8px 0"
            }}>
              <p style={{
                fontFamily: "'Instrument Serif', serif", fontSize: 19,
                fontStyle: "italic", lineHeight: 1.6, color: "var(--text)"
              }}>
                "Can I convert this into a monetary income stream somehow? Can I convert this into an output 
                stream that will genuinely interest people? Where is the value located — in me, in the AI, 
                in the interaction between us? What is the vocabulary to even talk about this?"
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--muted)", marginTop: 10
              }}>
                — The question that started this project
              </p>
            </div>
          </section>

          {/* WHAT IS EXCAVATION */}
          <section style={{ paddingBottom: "var(--section-gap)" }}>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 12
            }}>
              Excavation, not summary
            </h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.7,
              color: "var(--muted)", marginBottom: 32, maxWidth: 560
            }}>
              Summarizing your AI conversations gives you a shorter version of what you already know.
              Excavation asks a harder question: <em style={{ color: "var(--text)" }}>what can this become?</em>
            </p>

            <div style={{ display: "grid", gap: 14 }}>
              {[
                { label: "Summary", desc: "You discussed product strategy across 40 conversations.", color: "var(--muted)" },
                { label: "Excavation", desc: "Conversation #23 contains a product positioning that could become your investor pitch. It needs a market-sizing section and a demo. Estimated effort: 4 hours.", color: "var(--accent)" },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "18px 24px", border: "1px solid var(--border)", borderRadius: 10,
                  display: "flex", gap: 16, alignItems: "flex-start"
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
                    background: item.label === "Excavation" ? "var(--accent-light)" : "var(--surface)",
                    color: item.color
                  }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "var(--muted)", lineHeight: 1.6
                  }}>
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* METHOD */}
          <section id="method" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              Method
            </div>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 10
            }}>
              Five steps from data export to conversion
            </h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "var(--muted)",
              marginBottom: 36, lineHeight: 1.6
            }}>
              Works with ChatGPT, Claude, and Gemini exports. You'll need Claude Desktop with Cowork 
              (or Claude Code) for the extraction phase.
            </p>

            <div style={{ display: "grid", gap: 28 }}>
              <StepCard
                number={1}
                title="Export your data"
                description="Request your data export from your AI provider. ChatGPT: Settings → Data Controls → Export. You'll get a zip file — could be hundreds of megabytes."
                tier="Everyone"
              />
              <StepCard
                number={2}
                title="Parse and chunk"
                description="Run the parser script on your export. It splits conversations by theme, estimates token counts, and creates workable chunks (~80K tokens each) that fit within AI context windows."
                detail="The parser classifies conversations by scanning content, not just titles. A conversation titled 'Tuesday brainstorm' that mentions your product name gets properly tagged."
                tier="Requires Python"
              />
              <StepCard
                number={3}
                title="Triage"
                description="Feed the manifest to Cowork with the triage prompt. This is fast and cheap — it tells you what your corpus looks like, where the biggest conversations live, and what to process first."
                tier="Everyone"
              />
              <StepCard
                number={4}
                title="Excavate"
                description="Work through chunks using the extraction prompts. This is where conversion happens. Each prompt is designed to answer 'what can this become?' — not 'what does this say?'"
                detail="Use Sonnet for classification and structured extraction. Use Opus when you need honest assessment, creative judgment, or tracking how ideas evolved over time."
              />
              <StepCard
                number={5}
                title="Convert"
                description="Take your extraction outputs and ship them. A blog post. A pitch deck. A product spec. A job application. The excavation is only valuable if something leaves the chat window and enters the world."
              />
            </div>
          </section>

          {/* DOWNLOAD PARSER */}
          <section id="download" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              Download
            </div>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 10
            }}>
              Download the parser
            </h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "var(--muted)",
              marginBottom: 32, lineHeight: 1.6, maxWidth: 560
            }}>
              A Python script that parses your ChatGPT data export, splits conversations by theme,
              and creates workable chunks for extraction. Run it on your zip file and it produces
              an indexed, classified corpus ready for Cowork.
            </p>
            <a
              href="/phase0_parse_export.py"
              download
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "14px 28px", background: "var(--accent)", color: "#fff",
                borderRadius: 8, textDecoration: "none",
                fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
                transition: "opacity 0.15s"
              }}
              onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
              onMouseOut={e => e.currentTarget.style.opacity = "1"}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1v9M8 10l-3-3M8 10l3-3M2 13h12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              phase0_parse_export.py
            </a>
          </section>

          {/* PROMPTS */}
          <section id="prompts" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              Prompt library
            </div>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 10
            }}>
              Six prompts for different excavation goals
            </h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "var(--muted)",
              marginBottom: 32, lineHeight: 1.6
            }}>
              Each prompt targets a different kind of conversion. Start with the triage, then pick 
              based on what you're trying to produce.
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {PROMPTS.map(p => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  isOpen={openPrompt === p.id}
                  onToggle={() => setOpenPrompt(openPrompt === p.id ? null : p.id)}
                />
              ))}
            </div>
          </section>

          {/* COST CALCULATOR */}
          <section id="cost" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              What it costs
            </div>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 10
            }}>
              Cost calculator
            </h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "var(--muted)",
              marginBottom: 32, lineHeight: 1.6
            }}>
              API pricing as of early 2026. Costs vary by model and corpus size. 
              On a Max subscription, processing is included in your plan but you'll hit 
              usage limits and need to pace across multiple days.
            </p>
            <CostCalculator />
          </section>

          {/* THE HONEST PART */}
          <section id="philosophy" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              The hard part
            </div>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 24
            }}>
              Most of what you find won't be gold
            </h2>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.75,
              color: "var(--muted)"
            }}>
              <p style={{ marginBottom: 18 }}>
                Here's what nobody wants to hear: a large percentage of your AI conversations 
                are intellectually stimulating exploration that doesn't convert into anything. 
                That doesn't mean they were worthless — they shaped your thinking. But they're 
                not products, and pretending they are delays the real work.
              </p>
              <p style={{ marginBottom: 18 }}>
                The sycophancy problem is real. AI assistants are trained to be encouraging. 
                Ask one to assess your ideas and it will tell you they're brilliant. The honest 
                assessment prompt exists specifically to counter this — but even then, you need 
                to read critically.
              </p>
              <p style={{ marginBottom: 18 }}>
                The pattern to watch for: <em style={{ color: "var(--text)" }}>you have a thought, you 
                tease it out with AI, the conversation feels fascinating, you try to see what can 
                be done with it, and the value stays trapped in the chat</em>. If this describes you, 
                the excavation itself can become another instance of the pattern — an elaborate, 
                stimulating project that doesn't produce output.
              </p>
              <p style={{ marginBottom: 18, color: "var(--text)" }}>
                The test is simple: did something leave the chat window and reach another human being? 
                A published post. A sent application. A working demo shown to a user. 
                If not, the excavation is still in progress.
              </p>
              <p>
                The conversion problem isn't a technical problem. It's a human problem — the gap 
                between thinking and doing, amplified by AI's ability to make thinking feel 
                like doing.
              </p>
            </div>
          </section>

          {/* WHERE VALUE LIVES */}
          <section style={{ paddingBottom: "var(--section-gap)" }}>
            <h2 style={{
              fontFamily: "'Instrument Serif', serif", fontSize: 32, fontWeight: 400,
              marginBottom: 24
            }}>
              Where does the value actually live?
            </h2>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.75,
              color: "var(--muted)"
            }}>
              <p style={{ marginBottom: 18 }}>
                In the human's question, not the AI's answer. In the moment you saw a connection 
                the AI didn't suggest. In the decision you made about what mattered and what didn't. 
                In the problem you chose to work on. The AI is a mirror that makes your thinking 
                visible — but the thinking is yours.
              </p>
              <p style={{ marginBottom: 18 }}>
                The convertible value is almost never in the AI's long, structured output. 
                It's in the three sentences where you redirected the conversation because the AI 
                was going somewhere wrong. It's in the question you asked that reframed the problem. 
                It's in the thing you said that surprised you when you read it back.
              </p>
              <p>
                The excavation tools above are designed to help you find those moments. 
                But ultimately, only you can recognize them — because the value is in your 
                judgment about what matters, and that's the one thing the AI can't do for you.
              </p>
            </div>
          </section>

          {/* ABOUT */}
          <section id="about" style={{ paddingBottom: "var(--section-gap)" }}>
            <div style={{
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "var(--accent)",
              fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16
            }}>
              About
            </div>
            <div style={{
              padding: "32px 36px", border: "1px solid var(--border)", borderRadius: 12,
              background: "var(--surface)"
            }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 16, lineHeight: 1.8,
                color: "var(--muted)"
              }}>
                Built during an actual excavation of 2,578 conversations and 12.4 million tokens
                from a ChatGPT archive spanning April 2023 to March 2026. The methodology and prompts
                weren't planned — they emerged from trying to figure out what three years of AI
                conversations were really worth. Built by{" "}
                <a
                  href="https://github.com/gschul"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px solid var(--accent)" }}
                >
                  Guy Schultz
                </a>
                .
              </p>
            </div>
          </section>

          {/* FOOTER */}
          <footer style={{
            borderTop: "1px solid var(--border)", padding: "32px 0 48px",
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--muted)",
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <div>
              <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 17, color: "var(--text)" }}>excavate</span>
              <span style={{ margin: "0 12px", opacity: 0.4 }}>·</span>
              A methodology for converting AI conversations into real-world output
            </div>
            <div style={{ fontSize: 12 }}>
              Built during an excavation
            </div>
          </footer>

        </div>
      </div>
    </>
  );
}
