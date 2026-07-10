import { Check, CheckSquare2, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ItineraryActivityTask } from '../types';

type ActivityTasksProps = {
  itemId: string;
  itemTitle: string;
  tasks: ItineraryActivityTask[];
  actionId: string | null;
  onCreate: (title: string) => Promise<void>;
  onToggle: (task: ItineraryActivityTask) => Promise<void>;
  onUpdate: (task: ItineraryActivityTask, title: string) => Promise<void>;
  onDelete: (task: ItineraryActivityTask) => Promise<void>;
};

const normalizeTaskTitle = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

export function ActivityTasks({
  itemId,
  itemTitle,
  tasks,
  actionId,
  onCreate,
  onToggle,
  onUpdate,
  onDelete,
}: ActivityTasksProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const completedCount = tasks.filter((task) => task.isCompleted).length;
  const visibleTasks = showAll ? tasks : tasks.slice(0, 3);
  const createActionId = `create-${itemId}`;
  const isCreating = actionId === createActionId;

  const hasDuplicateTitle = (title: string, ignoredTaskId?: string) => {
    const normalized = normalizeTaskTitle(title);
    return tasks.some((task) => task.id !== ignoredTaskId && normalizeTaskTitle(task.title) === normalized);
  };

  const validateTitle = (title: string, ignoredTaskId?: string) => {
    const trimmed = title.trim();
    if (!trimmed) return 'Informe o nome da tarefa.';
    if (trimmed.length > 120) return 'Use ate 120 caracteres.';
    if (hasDuplicateTitle(trimmed, ignoredTaskId)) return 'Essa tarefa ja existe nesta atividade.';
    return null;
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const message = validateTitle(draftTitle);
    if (message) {
      setValidationMessage(message);
      return;
    }

    await onCreate(draftTitle.trim());
    setDraftTitle('');
    setValidationMessage(null);
    setIsAdding(false);
  };

  const startEditing = (task: ItineraryActivityTask) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setValidationMessage(null);
  };

  const handleUpdate = async (event: FormEvent, task: ItineraryActivityTask) => {
    event.preventDefault();
    const message = validateTitle(editingTitle, task.id);
    if (message) {
      setValidationMessage(message);
      return;
    }

    await onUpdate(task, editingTitle.trim());
    setEditingTaskId(null);
    setEditingTitle('');
    setValidationMessage(null);
  };

  const handleDelete = async (task: ItineraryActivityTask) => {
    const confirmed = window.confirm(`Excluir "${task.title}" desta atividade?`);
    if (!confirmed) return;
    await onDelete(task);
  };

  return (
    <section className="mt-5 rounded-2xl border border-[#dfe5ee] bg-[#f8f9ff] p-3 dark:border-slate-700 dark:bg-slate-800/65">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CheckSquare2 className="h-4 w-4 text-[#007c68] dark:text-emerald-300" />
            <p className="text-sm font-black text-[#0b1c30] dark:text-slate-50">Tarefas</p>
          </div>
          <p className="mt-1 text-xs font-bold text-[#667085] dark:text-slate-400">
            {tasks.length ? `${completedCount} de ${tasks.length} tarefas concluidas` : 'Nenhuma tarefa adicionada'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAdding((current) => !current);
            setValidationMessage(null);
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#bcd7d1] bg-white px-3 text-sm font-black text-[#007c68] transition hover:bg-[#eef8f6] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:border-emerald-400/30 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
        >
          {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isAdding ? 'Cancelar' : 'Adicionar tarefa'}
        </button>
      </div>

      {isAdding ? (
        <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nova tarefa para {itemTitle}</span>
            <input
              value={draftTitle}
              onChange={(event) => {
                setDraftTitle(event.target.value);
                setValidationMessage(null);
              }}
              maxLength={120}
              placeholder="Comprar ingresso"
              className="h-11 w-full rounded-xl border border-[#c6c6cd] bg-white px-3 text-sm font-bold text-[#0b1c30] outline-none transition placeholder:text-slate-400 focus:border-[#007c68] focus:ring-4 focus:ring-[#48fdd3]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            />
          </label>
          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#007c68] px-4 text-sm font-black text-white transition hover:bg-[#005f51] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar
          </button>
        </form>
      ) : null}

      {validationMessage ? (
        <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">{validationMessage}</p>
      ) : null}

      {tasks.length ? (
        <div className="mt-3 space-y-2">
          {visibleTasks.map((task) => {
            const isEditing = editingTaskId === task.id;
            const isToggleBusy = actionId === `toggle-${task.id}`;
            const isEditBusy = actionId === `edit-${task.id}`;
            const isDeleteBusy = actionId === `delete-${task.id}`;

            return (
              <div
                key={task.id}
                className="flex min-w-0 items-start gap-2 rounded-xl border border-white bg-white/85 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={task.isCompleted}
                  aria-label={`${task.isCompleted ? 'Desmarcar' : 'Concluir'} tarefa ${task.title}`}
                  disabled={isToggleBusy}
                  onClick={() => void onToggle(task)}
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-[#10b981] ${
                    task.isCompleted
                      ? 'border-[#007c68] bg-[#007c68] text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                      : 'border-[#c6c6cd] bg-white text-[#667085] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                  }`}
                >
                  {isToggleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <form onSubmit={(event) => void handleUpdate(event, task)} className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={editingTitle}
                        onChange={(event) => {
                          setEditingTitle(event.target.value);
                          setValidationMessage(null);
                        }}
                        maxLength={120}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-[#c6c6cd] bg-white px-3 text-sm font-bold text-[#0b1c30] outline-none focus:border-[#007c68] focus:ring-4 focus:ring-[#48fdd3]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                      />
                      <button
                        type="submit"
                        disabled={isEditBusy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#007c68] px-3 text-xs font-black text-white transition hover:bg-[#005f51] disabled:opacity-60 dark:bg-emerald-400 dark:text-emerald-950"
                      >
                        {isEditBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </button>
                    </form>
                  ) : (
                    <p className={`break-words text-sm font-bold leading-6 ${task.isCompleted ? 'text-slate-500 line-through decoration-2 dark:text-slate-400' : 'text-[#202431] dark:text-slate-100'}`}>
                      {task.title}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <button
                      type="button"
                      aria-label="Cancelar edicao da tarefa"
                      onClick={() => {
                        setEditingTaskId(null);
                        setEditingTitle('');
                        setValidationMessage(null);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Editar tarefa ${task.title}`}
                      onClick={() => startEditing(task)}
                      className="grid h-8 w-8 place-items-center rounded-xl text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Excluir tarefa ${task.title}`}
                    disabled={isDeleteBusy}
                    onClick={() => void handleDelete(task)}
                    className="grid h-8 w-8 place-items-center rounded-xl text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-500/15"
                  >
                    {isDeleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}

          {tasks.length > 3 ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="text-xs font-black text-[#007c68] transition hover:text-[#005f51] dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              {showAll ? 'Ver menos' : `Ver todas (${tasks.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
